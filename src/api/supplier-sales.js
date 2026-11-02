import { hasHelmCredentials, readCredentials } from "../server/credentials";
import {
  addDays,
  londonDayStartUtc,
  londonToday,
  resolveRange,
} from "../server/dates";
import { HELM_CHANNEL } from "../server/channels";
import { buildSupplierSales, findChannel } from "../server/supplierSales";

export default async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const query = req.query || {};
    const channel = findChannel(query.channel);
    if (!channel) {
      return res
        .status(400)
        .json({ error: `Unknown channel '${query.channel}'` });
    }
    const range = resolveRange(query, londonToday());
    if (range.error) return res.status(400).json({ error: range.error });
    const { from, to } = range;

    const credentials = readCredentials();
    if (channel.key === HELM_CHANNEL.key && !hasHelmCredentials(credentials)) {
      return res.status(500).json({
        error:
          "Holland & Barrett orders come from Helm: set GATSBY_HELM_BASE_URL, GATSBY_HELM_EMAIL and GATSBY_HELM_PASSWORD",
      });
    }

    const sections = await buildSupplierSales(channel.key, credentials, {
      from,
      to,
      since: londonDayStartUtc(from),
      until: londonDayStartUtc(addDays(to, 1)),
    });
    res.status(200).json({
      channel: channel.key,
      label: channel.label,
      currency: channel.currency,
      from,
      to,
      sections,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unexpected server error" });
  }
}
