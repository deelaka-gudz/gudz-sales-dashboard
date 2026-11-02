import { CHANNELS, HELM_CHANNEL, MIRAKL_CHANNELS } from "../server/channels";
import { CACHE_MIN_AGE_DAYS } from "../server/cache";
import { readCredentials } from "../server/credentials";
import { addDays, londonToday, resolveRange } from "../server/dates";
import { buildBestSellers } from "../server/supplierSales";

// The keys the dashboard tiles use: Amazon UK's FBM and FBA share one, as do Shopify's retail and wholesale.
const CHANNEL_KEYS = [
  ...new Set(
    [...CHANNELS, ...MIRAKL_CHANNELS, HELM_CHANNEL].map(
      (c) => c.group || c.key,
    ),
  ),
];

export default async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const today = londonToday();
    const range = resolveRange(req.query || {}, today);
    if (range.error) return res.status(400).json({ error: range.error });
    const { from, to } = range;

    const best = await buildBestSellers(
      CHANNEL_KEYS,
      readCredentials(),
      { from, to },
      addDays(today, -CACHE_MIN_AGE_DAYS),
    );
    res.status(200).json({ from, to, ...best });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unexpected server error" });
  }
}
