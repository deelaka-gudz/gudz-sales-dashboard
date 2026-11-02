import { requestJson } from "./http";
import { loadSkuCache, saveSkuCache } from "./cache";
import { helmRoot, login } from "./helm";

export const NO_SUPPLIER = "No supplier set";
export const NOT_IN_HELM = "SKU not in Helm";

const SKU_BATCH = 40;
const LOOKUP_CONCURRENCY = 6;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// The cache maps sku -> { at, parts }. `parts` says which supplier(s) a unit of
// the SKU comes from and how many single units each sold unit contains (the
// pack quantity).

const chunk = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size)
    chunks.push(list.slice(i, i + size));
  return chunks;
};

async function mapLimit(items, limit, task) {
  const results = [];
  for (const group of chunk(items, limit)) {
    results.push(...(await Promise.all(group.map(task))));
  }
  return results;
}

// The primary supplier if it is active, otherwise the first active one.
function pickSupplier(links = []) {
  const active = links.filter((link) => link.active && link.supplier_name);
  const link = active.find((l) => l.primary_supplier) || active[0];
  return link ? link.supplier_name : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RATE_LIMIT_WAITS = 4;
const MAX_RATE_LIMIT_WAIT_S = 65;

// Helm rate limits with "Please wait 33 seconds", which is longer than the
// shared client is willing to wait, so 429s are waited out here.
async function withRateLimit(task) {
  for (let waits = 0; ; waits++) {
    try {
      return await task();
    } catch (error) {
      if (error.status !== 429 || waits >= MAX_RATE_LIMIT_WAITS) throw error;
      const seconds =
        Number(/wait (\d+) seconds/.exec(error.message)?.[1]) || 30;
      await sleep(Math.min(seconds, MAX_RATE_LIMIT_WAIT_S) * 1000 + 500);
    }
  }
}

function createClient({ baseUrl, email, password }) {
  const root = helmRoot(baseUrl);
  let tokenPromise;
  const get = (path, label) =>
    withRateLimit(async () => {
      tokenPromise ||= withRateLimit(() => login(root, email, password));
      const token = await tokenPromise;
      return requestJson(
        `${root}${path}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
        label,
      );
    });

  // Exact SKU match, many at once. Returns a Map of sku -> inventory item.
  const itemsBySku = async (skus) => {
    const found = new Map();
    await mapLimit(
      chunk(skus, SKU_BATCH),
      LOOKUP_CONCURRENCY,
      async (batch) => {
        const query = batch
          .map((sku) => `filters[sku][]=${encodeURIComponent(sku)}`)
          .join("&");
        const body = await get(
          `/inventory?limit=100&page=1&${query}`,
          "Helm inventory lookup",
        );
        if (!Array.isArray(body?.data)) {
          throw new Error("Helm inventory response had no 'data' list");
        }
        body.data.forEach((item) => found.set(item.sku, item));
      },
    );
    return found;
  };

  // Bundles hold no supplier of their own; they link to the single items
  // (with a quantity) that they are made of.
  const components = async (item) => {
    const detail = await get(`/inventory/${item.id}`, "Helm inventory item");
    return (detail.linked_inventories || [])
      .filter((link) => link.inventory?.sku && link.quantity > 0)
      .map((link) => ({ sku: link.inventory.sku, quantity: link.quantity }));
  };

  return { itemsBySku, components };
}

// Returns a Map of sku -> [{ supplier, pack }].
export async function resolveSuppliers(helm, skus) {
  const now = Date.now();
  const skuCache = loadSkuCache();
  const result = new Map();
  const unknown = [];
  for (const sku of new Set(skus)) {
    const cached = skuCache[sku];
    if (cached && now - cached.at < CACHE_TTL_MS) result.set(sku, cached.parts);
    else unknown.push(sku);
  }
  if (!unknown.length) return result;

  const client = createClient(helm);
  const items = await client.itemsBySku(unknown);

  const bundles = new Map();
  const parts = new Map();
  for (const sku of unknown) {
    const item = items.get(sku);
    if (!item) {
      parts.set(sku, [{ supplier: NOT_IN_HELM, pack: 1 }]);
    } else if (item.supplier_links?.length) {
      parts.set(sku, [
        { supplier: pickSupplier(item.supplier_links) || NO_SUPPLIER, pack: 1 },
      ]);
    } else {
      bundles.set(sku, item);
    }
  }

  const bundleParts = new Map();
  await mapLimit([...bundles], LOOKUP_CONCURRENCY, async ([sku, item]) => {
    bundleParts.set(sku, await client.components(item));
  });
  const componentSkus = [
    ...new Set([...bundleParts.values()].flat().map((c) => c.sku)),
  ];
  const componentItems = componentSkus.length
    ? await client.itemsBySku(componentSkus)
    : new Map();

  for (const [sku, comps] of bundleParts) {
    parts.set(
      sku,
      comps.length
        ? comps.map(({ sku: componentSku, quantity }) => ({
            supplier:
              pickSupplier(componentItems.get(componentSku)?.supplier_links) ||
              NO_SUPPLIER,
            pack: quantity,
          }))
        : [{ supplier: NO_SUPPLIER, pack: 1 }],
    );
  }

  for (const [sku, value] of parts) {
    // A SKU Helm doesn't know yet may be added soon, so it is looked up again.
    if (value[0].supplier !== NOT_IN_HELM)
      skuCache[sku] = { at: now, parts: value };
    result.set(sku, value);
  }
  saveSkuCache();
  return result;
}
