import { fetchChannelAdvisorManufacturers } from "./channelAdvisor";
import { loadManufacturerCache, saveManufacturerCache } from "./cache";

export const NO_MANUFACTURER = "No manufacturer set";
export const NOT_IN_CA = "SKU not in ChannelAdvisor";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Returns a Map of sku -> manufacturer name. `account` names the ChannelAdvisor
// account the catalogue is read from, which keeps the cache apart per account.
export async function resolveManufacturers(account, creds, skus) {
  const now = Date.now();
  const cache = loadManufacturerCache();
  const result = new Map();
  const unknown = [];
  for (const sku of new Set(skus)) {
    const cached = cache[`${account}|${sku}`];
    if (cached && now - cached.at < CACHE_TTL_MS) {
      result.set(sku, cached.manufacturer);
    } else {
      unknown.push(sku);
    }
  }
  if (!unknown.length) return result;

  const found = await fetchChannelAdvisorManufacturers(creds, unknown);
  for (const sku of unknown) {
    const manufacturer = found.get(sku.toLowerCase());
    if (manufacturer === undefined) {
      // A SKU ChannelAdvisor doesn't know yet may be added soon, so it is
      // looked up again next time.
      result.set(sku, NOT_IN_CA);
    } else {
      const name = manufacturer || NO_MANUFACTURER;
      cache[`${account}|${sku}`] = { at: now, manufacturer: name };
      result.set(sku, name);
    }
  }
  saveManufacturerCache();
  return result;
}
