import {
  CHANNELS,
  HELM_CHANNEL,
  HELM_IGNORED_STATUS,
  MIRAKL_CHANNELS,
  MIRAKL_IGNORED_STATES,
  channelOwnsOrder,
} from "./channels";
import { resolveCatalogue } from "./catalogue";
import { fetchChannelAdvisorOrders } from "./channelAdvisor";
import { loadBestSellerCache, saveBestSellerCache } from "./cache";
import { addDays, eachDay, londonDayOf, londonDayStartUtc } from "./dates";
import { fetchHelmOrders } from "./helm";
import { fetchMiraklOrders } from "./mirakl";
import { resolveSuppliers } from "./suppliers";

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Each loader returns sections of order lines as { label, lines }, where a line
// is { day, orderId, sku, title, quantity, revenue }. `label` names the fulfilment
// type or segment for grouped channels (Amazon UK FBM / FBA, Shopify retail / wholesale) and is null otherwise.
const toLine = (day, orderId, sku, title, quantity, revenue) => ({
  day,
  orderId,
  sku,
  title: title ? String(title) : "",
  quantity: number(quantity),
  revenue,
});

async function caSections({ channels, creds, since, until }) {
  const filter =
    `SiteName eq '${channels[0].siteName}' and CheckoutDateUtc ge ${since}` +
    ` and CheckoutDateUtc lt ${until}`;
  const orders = await fetchChannelAdvisorOrders(creds, filter, {
    withItems: true,
  });
  return channels.map((channel) => ({
    label: channel.group ? channel.groupLabel : null,
    lines: orders
      .filter((order) => channelOwnsOrder(channel, order))
      .flatMap((order) =>
        (order.Items || []).map((item) =>
          toLine(
            londonDayOf(order.CheckoutDateUtc),
            order.ID,
            item.Sku,
            item.Title,
            item.Quantity,
            number(item.UnitPrice) * number(item.Quantity),
          ),
        ),
      ),
  }));
}

async function miraklSections({ channel, creds, since, until }) {
  const orders = await fetchMiraklOrders(
    channel.label,
    creds.baseUrl,
    creds.apiKey,
    since,
    until,
  );
  const lines = orders
    .filter((order) => !MIRAKL_IGNORED_STATES.includes(order.order_state))
    .flatMap((order) =>
      (order.order_lines || []).map((line) =>
        toLine(
          londonDayOf(order.created_date),
          order.order_id,
          line.offer_sku,
          line.product_title,
          line.quantity,
          number(line.price),
        ),
      ),
    );
  return [{ label: null, lines }];
}

async function helmSections({ creds, from, to }) {
  const orders = await fetchHelmOrders(creds, from, addDays(to, 1));
  const lines = orders
    .filter((order) => !HELM_IGNORED_STATUS.test(order.status || ""))
    .flatMap((order) =>
      (order.inventory || []).map((line) =>
        toLine(
          String(order.date_received || "").slice(0, 10),
          order.id,
          line.sku,
          line.name,
          line.quantity,
          number(line.price),
        ),
      ),
    );
  return [{ label: null, lines }];
}

async function fetchSections(channelKey, { accounts, mirakl, helm }, range) {
  const caChannels = CHANNELS.filter((c) => (c.group || c.key) === channelKey);
  if (caChannels.length) {
    return caSections({
      channels: caChannels,
      creds: accounts[caChannels[0].account],
      ...range,
    });
  }
  const miraklChannel = MIRAKL_CHANNELS.find((c) => c.key === channelKey);
  if (miraklChannel) {
    return miraklSections({
      channel: miraklChannel,
      creds: mirakl[channelKey],
      ...range,
    });
  }
  return helmSections({ creds: helm, ...range });
}

export function findChannel(channelKey) {
  return [...CHANNELS, ...MIRAKL_CHANNELS, HELM_CHANNEL].find(
    (c) => c.key === channelKey,
  );
}

// Groups lines by name, ignoring case ("ECOVER" and "Ecover" are one name,
// shown as the spelling used by most lines). `split(line)` returns the
// { name, units, revenue } shares of one order line.
function totalBy(lines, split) {
  const totals = new Map();
  for (const line of lines) {
    for (const { name, units, revenue } of split(line)) {
      const key = name.toLowerCase();
      const entry = totals.get(key) || {
        spellings: new Map(),
        units: 0,
        revenue: 0,
        orders: new Set(),
      };
      entry.spellings.set(name, (entry.spellings.get(name) || 0) + 1);
      entry.units += units;
      entry.revenue += revenue;
      entry.orders.add(line.orderId);
      totals.set(key, entry);
    }
  }
  return [...totals.values()]
    .map(({ spellings, units, revenue, orders }) => ({
      name: [...spellings].sort((x, y) => y[1] - x[1])[0][0],
      units,
      revenue: Math.round(revenue * 100) / 100,
      orders: orders.size,
    }))
    .sort((x, y) => y.revenue - x.revenue);
}

const packOf = (info) => info.parts.reduce((sum, part) => sum + part.pack, 0);

// A bundle line is shared between its component suppliers by pack quantity.
const bySupplier = (infoOf) => (line) => {
  const { parts } = infoOf(line);
  const packs = parts.reduce((sum, part) => sum + part.pack, 0);
  return parts.map((part) => ({
    name: part.supplier,
    units: line.quantity * part.pack,
    revenue: (line.revenue * part.pack) / packs,
  }));
};

// The manufacturer is that of the SKU sold; units still count every item in a
// pack.
const byManufacturer = (infoOf) => (line) => {
  const info = infoOf(line);
  return [
    {
      name: info.manufacturer,
      units: line.quantity * packOf(info),
      revenue: line.revenue,
    },
  ];
};

// What is known about each SKU sold: { parts, manufacturer, ourSku }, where
// `parts` are the { supplier, pack } shares a unit of the SKU is made of.
// Everything comes from ChannelAdvisor, except for Holland & Barrett, whose
// orders and SKUs live in Helm, so Helm also supplies the supplier and pack.
async function resolveSkus(channelKey, credentials, skus) {
  const caChannel = CHANNELS.find((c) => (c.group || c.key) === channelKey);
  const account = caChannel ? caChannel.account : "UK";
  const catalogue = await resolveCatalogue(
    account,
    credentials.accounts[account],
    skus,
  );
  const helmSuppliers =
    channelKey === HELM_CHANNEL.key
      ? await resolveSuppliers(credentials.helm, skus)
      : null;

  const info = new Map();
  for (const sku of new Set(skus)) {
    const product = catalogue.get(sku);
    info.set(sku, {
      manufacturer: product.manufacturer,
      ourSku: helmSuppliers ? sku : product.ourSku,
      parts: helmSuppliers?.get(sku) || [
        { supplier: product.supplier, pack: product.unitCount },
      ],
    });
  }
  return info;
}

// Loads a channel's order lines and what is known about their SKUs:
// { sections: [{ label, lines }], infoOf(line) }.
async function loadChannel(channelKey, credentials, range) {
  const sections = (await fetchSections(channelKey, credentials, range)).map(
    ({ label, lines }) => ({
      label,
      lines: lines.filter((line) => line.sku && line.quantity > 0),
    }),
  );
  const skus = sections.flatMap(({ lines }) => lines.map((line) => line.sku));
  const info = await resolveSkus(channelKey, credentials, skus);
  return { sections, infoOf: (line) => info.get(line.sku) };
}

// Adds up units per SKU ("Our SKU", so every listing of the same item counts
// together) and quantity per listing, to find the best sellers.
function createTally() {
  const skus = new Map();
  const products = new Map();
  const bump = (map, { name, title, units, quantity }) => {
    const key = name.toLowerCase();
    const entry = map.get(key) || { name, title: "", units: 0, quantity: 0 };
    entry.units += units;
    entry.quantity += quantity;
    entry.title ||= title;
    map.set(key, entry);
  };
  return {
    add(lines, infoOf) {
      for (const line of lines) {
        const info = infoOf(line);
        const units = line.quantity * packOf(info);
        const { title, quantity } = line;
        bump(skus, { name: info.ourSku, title, units, quantity });
        bump(products, { name: line.sku, title, units, quantity });
      }
    },
    // The totals as plain data, which is how a day is kept in the cache.
    snapshot() {
      return { skus: [...skus.values()], products: [...products.values()] };
    },
    merge(snapshot) {
      snapshot.skus.forEach((entry) => bump(skus, entry));
      snapshot.products.forEach((entry) => bump(products, entry));
    },
    best() {
      const top = (map, field) =>
        [...map.values()].sort((x, y) => y[field] - x[field])[0] || null;
      return {
        bestSku: top(skus, "units"),
        bestProduct: top(products, "quantity"),
      };
    },
  };
}

// Returns sections sorted by revenue: [{ label, suppliers, manufacturers,
// bestSku, bestProduct }]. `units` is quantity sold times the pack size, so a
// line of 2 for a "pack of 6" counts 12 units.
export async function buildSupplierSales(channelKey, credentials, range) {
  const { sections, infoOf } = await loadChannel(
    channelKey,
    credentials,
    range,
  );
  return sections.map(({ label, lines }) => {
    const tally = createTally();
    tally.add(lines, infoOf);
    return {
      label,
      suppliers: totalBy(lines, bySupplier(infoOf)),
      manufacturers: totalBy(lines, byManufacturer(infoOf)),
      ...tally.best(),
    };
  });
}

// Best selling SKU (most units) and product (most quantity) for each channel
// and across all of them: { overall, channels: { [key]: best | { error } } }.
// Days up to `cacheableUpTo` are kept once worked out, so only the days not
// seen before are fetched.
export async function buildBestSellers(
  channelKeys,
  credentials,
  range,
  cacheableUpTo,
) {
  const cache = loadBestSellerCache();
  const wanted = eachDay(range.from, range.to);
  const overall = createTally();
  const channels = {};
  await Promise.all(
    channelKeys.map(async (key) => {
      try {
        const tally = createTally();
        const needed = new Set();
        for (const day of wanted) {
          const cached = day <= cacheableUpTo && cache[day]?.[key];
          if (cached) tally.merge(cached);
          else needed.add(day);
        }
        if (needed.size) {
          const first = [...needed][0];
          const last = [...needed].pop();
          const { sections, infoOf } = await loadChannel(key, credentials, {
            from: first,
            to: last,
            since: londonDayStartUtc(first),
            until: londonDayStartUtc(addDays(last, 1)),
          });
          const lines = sections.flatMap((section) => section.lines);
          for (const day of needed) {
            const dayTally = createTally();
            dayTally.add(
              lines.filter((line) => line.day === day),
              infoOf,
            );
            const snapshot = dayTally.snapshot();
            tally.merge(snapshot);
            if (day <= cacheableUpTo) {
              cache[day] = { ...cache[day], [key]: snapshot };
            }
          }
        }
        overall.merge(tally.snapshot());
        channels[key] = tally.best();
      } catch (error) {
        channels[key] = { error: error.message || "Could not be loaded" };
      }
    }),
  );
  saveBestSellerCache();
  return { overall: overall.best(), channels };
}
