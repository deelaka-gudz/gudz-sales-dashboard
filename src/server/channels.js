export const CHANNELS = [
  {
    key: "amazon_uk",
    label: "Amazon UK",
    siteName: "Amazon UK",
    fulfilment: "merchant",
    group: "amazon_uk",
    groupLabel: "FBM",
    account: "UK",
    currency: "GBP",
  },
  {
    key: "amazon_fba_uk",
    label: "Amazon FBA UK",
    siteName: "Amazon UK",
    fulfilment: "fba",
    group: "amazon_uk",
    groupLabel: "FBA",
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

// Whether a ChannelAdvisor order belongs to this channel.
export const channelOwnsOrder = (channel, order) => {
  const isFba = order.DistributionCenterTypeRollup === FBA_ROLLUP_TYPE;
  return (
    channel.siteName === order.SiteName &&
    (!channel.fulfilment || (channel.fulfilment === "fba") === isFba)
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
