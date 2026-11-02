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

// Each loader returns order lines as { sku, quantity, revenue }.
async function caLines({ channel, creds, since, until }) {
  const filter =
    `SiteName eq '${channel.siteName}' and CheckoutDateUtc ge ${since}` +
    ` and CheckoutDateUtc lt ${until}`;
  const orders = await fetchChannelAdvisorOrders(creds, filter, {
    withItems: true,
  });
  return orders
    .filter((order) => channelOwnsOrder(channel, order))
    .flatMap((order) => order.Items || [])
    .map((item) => ({
      sku: item.Sku,
      quantity: number(item.Quantity),
      revenue: number(item.UnitPrice) * number(item.Quantity),
    }));
}

async function miraklLines({ channel, creds, since, until }) {
  const orders = await fetchMiraklOrders(
    channel.label,
    creds.baseUrl,
    creds.apiKey,
    since,
    until,
  );
  return orders
    .filter((order) => !MIRAKL_IGNORED_STATES.includes(order.order_state))
    .flatMap((order) => order.order_lines || [])
    .map((line) => ({
      sku: line.offer_sku,
      quantity: number(line.quantity),
      revenue: number(line.price),
    }));
}

async function helmLines({ creds, from, to }) {
  const orders = await fetchHelmOrders(creds, from, addDays(to, 1));
  return orders
    .filter((order) => !HELM_IGNORED_STATUS.test(order.status || ""))
    .flatMap((order) => order.inventory || [])
    .map((line) => ({
      sku: line.sku,
      quantity: number(line.quantity),
      revenue: number(line.price),
    }));
}

async function fetchLines(channelKey, { accounts, mirakl, helm }, range) {
  const caChannel = CHANNELS.find((c) => c.key === channelKey);
  if (caChannel) {
    return caLines({
      channel: caChannel,
      creds: accounts[caChannel.account],
      ...range,
    });
  }
  const miraklChannel = MIRAKL_CHANNELS.find((c) => c.key === channelKey);
  if (miraklChannel) {
    return miraklLines({
      channel: miraklChannel,
      creds: mirakl[channelKey],
      ...range,
    });
  }
  return helmLines({ creds: helm, ...range });
}

export function findChannel(channelKey) {
  return [...CHANNELS, ...MIRAKL_CHANNELS, HELM_CHANNEL].find(
    (c) => c.key === channelKey,
  );
}

// Returns suppliers sorted by revenue. `units` is quantity sold times the pack
// quantity, so a line of 2 for a "pack of 6" bundle counts 12 units.
export async function buildSupplierSales(channelKey, credentials, range) {
  const lines = (await fetchLines(channelKey, credentials, range)).filter(
    (line) => line.sku && line.quantity > 0,
  );
  const resolved = await resolveSuppliers(
    credentials.helm,
    lines.map((line) => line.sku),
  );

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
