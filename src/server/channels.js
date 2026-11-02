export const CHANNELS = [
  {
    key: "amazon_uk",
    label: "Amazon UK",
    siteName: "Amazon UK",
    fulfilment: "merchant",
    group: "amazon_uk",
    groupLabel: "Fulfilled by Merchant (FBM)",
    groupShortLabel: "FBM",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "amazon_fba_uk",
    label: "Amazon FBA UK",
    siteName: "Amazon UK",
    fulfilment: "fba",
    group: "amazon_uk",
    groupLabel: "Fulfilled by Amazon (FBA)",
    groupShortLabel: "FBA",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "shopify",
    label: "Shopify",
    siteName: "Shopify",
    segment: "retail",
    group: "shopify",
    groupLabel: "Retail",
    groupShortLabel: "Retail",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "shopify_wholesale",
    label: "Shopify Wholesale",
    siteName: "Shopify",
    segment: "wholesale",
    group: "shopify",
    groupLabel: "Wholesale",
    groupShortLabel: "Wholesale",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "ebay_uk",
    label: "eBay UK",
    siteName: "eBay Fixed Price UK",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "temu_uk",
    label: "Temu UK",
    siteName: "Temu UK",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "amazon_ie",
    label: "Amazon Ireland",
    siteName: "Amazon Seller Central - IE",
    account: "IRE",
    currency: "EUR",
  },
];

// ChannelAdvisor marks orders that Amazon ships from its own warehouses (FBA)
// as "ExternallyManaged"; everything else is fulfilled by Gudz.
export const FBA_ROLLUP_TYPE = "ExternallyManaged";

// The Shopify store tags its B2B orders (e.g. "WholesaleHelperRegularOrderGraphQL");
// every other Shopify order is a retail sale.
const WHOLESALE_TAG = /wholesale/i;

// Whether a ChannelAdvisor order belongs to this channel.
export const channelOwnsOrder = (channel, order) => {
  const isFba = order.DistributionCenterTypeRollup === FBA_ROLLUP_TYPE;
  const isWholesale = WHOLESALE_TAG.test(order.OrderTags || "");
  return (
    channel.siteName === order.SiteName &&
    (!channel.fulfilment || (channel.fulfilment === "fba") === isFba) &&
    (!channel.segment || (channel.segment === "wholesale") === isWholesale)
  );
};

export const MIRAKL_CHANNELS = [
  { key: "tesco", label: "Tesco", currency: "GBP" },
  { key: "superdrug", label: "Superdrug", currency: "GBP" },
];

export const HELM_CHANNEL = {
  key: "holland_barrett",
  label: "Holland & Barrett",
  currency: "GBP",
};

export const HELM_IGNORED_STATUS = /cancel/i;

export const MIRAKL_IGNORED_STATES = ["CANCELED", "REFUSED"];

export const ALL_CHANNELS = [...CHANNELS, ...MIRAKL_CHANNELS, HELM_CHANNEL];
