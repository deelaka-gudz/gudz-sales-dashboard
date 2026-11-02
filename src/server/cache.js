import fs from "fs";
import path from "path";

export const CACHE_MIN_AGE_DAYS = 1;

const CACHE_FILE = path.join(process.cwd(), ".sales-cache", "days.json");

const SKU_CACHE_FILE = path.join(
  process.cwd(),
  ".sales-cache",
  "suppliers.json",
);

let dayCache = null;

export const isEntry = (entry) =>
  Boolean(entry) &&
  Number.isFinite(entry.count) &&
  Number.isFinite(entry.revenue);

export function loadDayCache() {
  if (!dayCache) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      const valid =
        parsed && typeof parsed === "object" && !Array.isArray(parsed);
      dayCache = valid ? parsed : {};
      // Days cached before Amazon FBA UK was split out still count FBA orders
      // under Amazon UK, so drop that figure and let it be fetched again.
      for (const day of Object.values(dayCache)) {
        if (day?.amazon_uk && !day.amazon_fba_uk) delete day.amazon_uk;
      }
    } catch {
      dayCache = {};
    }
  }
  return dayCache;
}

function writeCacheFile(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value));
    fs.renameSync(temp, file);
  } catch {
    // The cache is best-effort; the in-memory copy still works.
  }
}

export function saveDayCache() {
  writeCacheFile(CACHE_FILE, dayCache);
}

// SKU -> supplier lookups from Helm, kept on disk because they are slow to
// fetch and Gatsby can reload the function between requests.
let skuCache = null;

export function loadSkuCache() {
  if (!skuCache) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SKU_CACHE_FILE, "utf8"));
      const valid =
        parsed && typeof parsed === "object" && !Array.isArray(parsed);
      skuCache = valid ? parsed : {};
    } catch {
      skuCache = {};
    }
  }
  return skuCache;
}

export function saveSkuCache() {
  writeCacheFile(SKU_CACHE_FILE, skuCache);
}

// SKU -> catalogue details (manufacturer, supplier, pack size) from
// ChannelAdvisor, kept for the same reasons.
const CATALOGUE_CACHE_FILE = path.join(
  process.cwd(),
  ".sales-cache",
  "catalogue.json",
);
let catalogueCache = null;

export function loadCatalogueCache() {
  if (!catalogueCache) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CATALOGUE_CACHE_FILE, "utf8"));
      const valid =
        parsed && typeof parsed === "object" && !Array.isArray(parsed);
      catalogueCache = valid ? parsed : {};
    } catch {
      catalogueCache = {};
    }
  }
  return catalogueCache;
}

export function saveCatalogueCache() {
  writeCacheFile(CATALOGUE_CACHE_FILE, catalogueCache);
}

// Per-day best seller totals for each channel. Days that are over never
// change, so each is worked out once.
const BEST_SELLER_CACHE_FILE = path.join(
  process.cwd(),
  ".sales-cache",
  "bestsellers.json",
);
let bestSellerCache = null;

export function loadBestSellerCache() {
  if (!bestSellerCache) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(BEST_SELLER_CACHE_FILE, "utf8"),
      );
      const valid =
        parsed && typeof parsed === "object" && !Array.isArray(parsed);
      bestSellerCache = valid ? parsed : {};
    } catch {
      bestSellerCache = {};
    }
  }
  return bestSellerCache;
}

export function saveBestSellerCache() {
  writeCacheFile(BEST_SELLER_CACHE_FILE, bestSellerCache);
}
