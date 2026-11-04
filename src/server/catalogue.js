import { fetchChannelAdvisorCatalogue } from "./channelAdvisor";
import { loadCatalogueCache, saveCatalogueCache } from "./cache";

export const NO_MANUFACTURER = "No brand set";
export const NO_SUPPLIER = "No supplier set";
export const NOT_IN_CA = "SKU not in ChannelAdvisor";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Returns a Map of sku -> { manufacturer, supplier, ourSku, unitCount }. `account`
// names the ChannelAdvisor account the catalogue is read from, which keeps the
// cache apart per account. A SKU ChannelAdvisor doesn't know gets NOT_IN_CA
// names and a pack size of 1.
export async function resolveCatalogue(account, creds, skus) {
  const now = Date.now();
  const cache = await loadCatalogueCache();
  const result = new Map();
  const unknown = [];
  for (const sku of new Set(skus)) {
    const cached = cache[`${account}|${sku}`];
    if (cached && now - cached.at < CACHE_TTL_MS) {
      result.set(sku, cached.product);
    } else {
      unknown.push(sku);
    }
  }
  if (!unknown.length) return result;

  const found = await fetchChannelAdvisorCatalogue(creds, unknown);
  for (const sku of unknown) {
    const product = found.get(sku.toLowerCase());
    if (!product) {
      // A SKU ChannelAdvisor doesn't know yet may be added soon, so it is
      // looked up again next time.
      result.set(sku, {
        manufacturer: NOT_IN_CA,
        supplier: NOT_IN_CA,
        ourSku: sku,
        unitCount: 1,
      });
      continue;
    }
    const entry = {
      manufacturer: product.manufacturer || NO_MANUFACTURER,
      supplier: product.supplier || NO_SUPPLIER,
      ourSku: product.ourSku || sku,
      unitCount: product.unitCount,
    };
    cache[`${account}|${sku}`] = { at: now, product: entry };
    result.set(sku, entry);
  }
  await saveCatalogueCache();
  return result;
}
