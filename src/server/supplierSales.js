import {
  CHANNELS,
  HELM_CHANNEL,
  HELM_IGNORED_STATUS,
  MIRAKL_CHANNELS,
  MIRAKL_IGNORED_STATES,
  channelOwnsOrder,
} from "./channels";
import { fetchChannelAdvisorOrders } from "./channelAdvisor";
import { addDays } from "./dates";
import { fetchHelmOrders } from "./helm";
import { fetchMiraklOrders } from "./mirakl";
import { resolveManufacturers } from "./manufacturers";
import { resolveSuppliers } from "./suppliers";

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Each loader returns sections of order lines as { label, lines }, where a line
// is { sku, quantity, revenue }. `label` names the fulfilment type for grouped
// channels (Amazon UK FBM / FBA) and is null otherwise.
const toLine = (sku, quantity, revenue) => ({
  sku,
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
      .flatMap((order) => order.Items || [])
      .map((item) =>
        toLine(
          item.Sku,
          item.Quantity,
          number(item.UnitPrice) * number(item.Quantity),
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
    .flatMap((order) => order.order_lines || [])
    .map((line) => toLine(line.offer_sku, line.quantity, number(line.price)));
  return [{ label: null, lines }];
}

async function helmSections({ creds, from, to }) {
  const orders = await fetchHelmOrders(creds, from, addDays(to, 1));
  const lines = orders
    .filter((order) => !HELM_IGNORED_STATUS.test(order.status || ""))
    .flatMap((order) => order.inventory || [])
    .map((line) => toLine(line.sku, line.quantity, number(line.price)));
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
        lines: 0,
      };
      entry.spellings.set(name, (entry.spellings.get(name) || 0) + 1);
      entry.units += units;
      entry.revenue += revenue;
      entry.lines += 1;
      totals.set(key, entry);
    }
  }
  return [...totals.values()]
    .map(({ spellings, units, revenue, lines: lineCount }) => ({
      name: [...spellings].sort((x, y) => y[1] - x[1])[0][0],
      units,
      revenue: Math.round(revenue * 100) / 100,
      lines: lineCount,
    }))
    .sort((x, y) => y.revenue - x.revenue);
}

// A bundle line is shared between its component suppliers by pack quantity.
const bySupplier = (resolved) => (line) => {
  const parts = resolved.get(line.sku);
  const packs = parts.reduce((sum, part) => sum + part.pack, 0);
  return parts.map((part) => ({
    name: part.supplier,
    units: line.quantity * part.pack,
    revenue: (line.revenue * part.pack) / packs,
  }));
};

// The manufacturer is that of the SKU sold; units still count every item in a
// pack.
const byManufacturer = (resolved, manufacturers) => (line) => {
  const packs = resolved
    .get(line.sku)
    .reduce((sum, part) => sum + part.pack, 0);
  return [
    {
      name: manufacturers.get(line.sku),
      units: line.quantity * packs,
      revenue: line.revenue,
    },
  ];
};

// Returns sections sorted by revenue: [{ label, suppliers, manufacturers }].
// `units` is quantity sold times the pack quantity, so a line of 2 for a "pack
// of 6" bundle counts 12 units.
export async function buildSupplierSales(channelKey, credentials, range) {
  const sections = (await fetchSections(channelKey, credentials, range)).map(
    ({ label, lines }) => ({
      label,
      lines: lines.filter((line) => line.sku && line.quantity > 0),
    }),
  );
  const skus = sections.flatMap(({ lines }) => lines.map((line) => line.sku));
  const caChannel = CHANNELS.find((c) => (c.group || c.key) === channelKey);
  const account = caChannel ? caChannel.account : "UK";
  const [resolved, manufacturers] = await Promise.all([
    resolveSuppliers(credentials.helm, skus),
    resolveManufacturers(account, credentials.accounts[account], skus),
  ]);
  return sections.map(({ label, lines }) => ({
    label,
    suppliers: totalBy(lines, bySupplier(resolved)),
    manufacturers: totalBy(lines, byManufacturer(resolved, manufacturers)),
  }));
}
