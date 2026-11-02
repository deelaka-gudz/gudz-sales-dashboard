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

function totalBySupplier(lines, resolved) {
  const totals = new Map();
  for (const line of lines) {
    const parts = resolved.get(line.sku);
    const packs = parts.reduce((sum, part) => sum + part.pack, 0);
    for (const part of parts) {
      const entry = totals.get(part.supplier) || {
        units: 0,
        revenue: 0,
        lines: 0,
      };
      entry.units += line.quantity * part.pack;
      entry.revenue += (line.revenue * part.pack) / packs;
      entry.lines += 1;
      totals.set(part.supplier, entry);
    }
  }
  return [...totals]
    .map(([name, { units, revenue, lines: lineCount }]) => ({
      name,
      units,
      revenue: Math.round(revenue * 100) / 100,
      lines: lineCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Returns sections of suppliers sorted by revenue: [{ label, suppliers }].
// `units` is quantity sold times the pack quantity, so a line of 2 for a "pack
// of 6" bundle counts 12 units.
export async function buildSupplierSales(channelKey, credentials, range) {
  const sections = (await fetchSections(channelKey, credentials, range)).map(
    ({ label, lines }) => ({
      label,
      lines: lines.filter((line) => line.sku && line.quantity > 0),
    }),
  );
  const resolved = await resolveSuppliers(
    credentials.helm,
    sections.flatMap(({ lines }) => lines.map((line) => line.sku)),
  );
  return sections.map(({ label, lines }) => ({
    label,
    suppliers: totalBySupplier(lines, resolved),
  }));
}
