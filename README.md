# Gudz Sales Dashboard ![Dashboard](https://img.shields.io/badge/Dashboard-brightgreen)

A Gatsby 5 dashboard that shows order counts and revenue for every Gudz sales
channel in one place: Amazon UK (FBM and FBA), eBay UK, Temu UK, Amazon Ireland, Tesco,
Superdrug and Holland & Barrett. The browser calls one Gatsby Function
(`/api/today-sales`), which pulls the numbers from each channel's API, so no
credentials ever reach the page.

## What it does

1. **Shows the sales for a range**: Today, Yesterday, Last 30 days, Pick a date (one day from a calendar) or Custom range (a start and end date). The header shows the range and the dates it covers, in London time.
2. **Reads each channel from its own source**:
   - **Amazon UK (FBM and FBA), eBay UK, Temu UK, Amazon Ireland**: ChannelAdvisor (Rithum) OData API. The UK and Ireland accounts have separate credentials, and each channel is picked out by its site name (see `src/server/channels.js`). Amazon UK orders are split by `DistributionCenterTypeRollup`: `ExternallyManaged` orders (shipped by Amazon) are FBA, the rest are FBM. They are fetched and cached as two channels (`amazon_uk`, `amazon_fba_uk`) but shown as one Amazon UK tile whose `parts` list FBM and FBA.
   - **Tesco, Superdrug**: Mirakl Connect API, using `start_date` and `end_date`.
   - **Holland & Barrett**: the DC/Helm API. H&B has no API of its own, so the orders that the H&B Order Feeding automation creates in Helm (tagged "H&B Order") are counted instead. The day is the time the order was created in Helm (`date_received`), not the customer's order time, and cancelled orders are skipped, so the numbers can differ slightly from the H&B vendor portal. Today's orders only appear once the automation has run.
3. **Counts per day and per channel**: each order is placed on its London calendar day, and a channel's revenue is added up in its own currency (Amazon Ireland is EUR, the rest GBP). The KPI cards at the top total the orders and the GBP revenue.
4. **Caches finished days**: Yesterday and older days are saved per day, in memory and in `.sales-cache/days.json`, so Last 30 days only fetches the days it hasn't seen. Today is always live. Add `?refresh=1` to the API call to bypass the cache.
5. **Shows a card per channel** with its logo, orders, revenue and share of the total, then a **Share by channel** donut chart (switch between Orders and Revenue; Amazon Ireland is left out of the revenue view because it's in EUR).
6. **Breaks a channel down by supplier**: click a channel card to open its sales by supplier (units, revenue and share). Each order line's SKU is looked up in Helm and credited to the item's primary supplier. A bundle SKU has no supplier of its own, so it is credited to the single items it is made of, and its units are the quantity sold times the pack quantity (the quantity on the bundle's link in Helm). SKUs Helm doesn't know are shown as "SKU not in Helm", and items without a supplier as "No supplier set". Revenue here is the item price, so it leaves out postage and won't match the channel total.
7. **Keeps one channel's failure from hiding the rest**: a channel that errors shows the error on its own card and is left out of the totals, and the other channels still load. Missing credentials are reported by name, in one message.

## Usage

```bat
npm install
copy .env.example .env
npm run develop
```

Fill in `.env` (see [Environment](#environment)), then open
http://localhost:8000. The `.env` file is git-ignored. Restart the dev server
after changing it, because the values are read when the server starts.

Gatsby 5 supports Node 18 to 22 (Node 26 isn't supported yet).

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run develop` | Dev server with the API on port 8000 |
| `npm run build`   | Production build into `public`       |
| `npm run serve`   | Serves the production build          |
| `npm run clean`   | Clears `.cache` and `public`         |

Don't run `gatsby build` while the dev server is running, because they share
the `.cache` folder. Gatsby Functions need a host that runs them (Gatsby
Cloud, Netlify, or `gatsby develop`); a plain static host won't serve
`/api/today-sales`.

### Environment

Set these in `.env` (the template is `.env.example`):

| Variable                                                                          | Used for                        |
| --------------------------------------------------------------------------------- | ------------------------------- |
| `GATSBY_CA_UK_APPLICATION_ID`, `_SHARED_SECRET`, `_REFRESH_TOKEN`, `_PROFILE_ID`  | ChannelAdvisor, UK account      |
| `GATSBY_CA_IRE_APPLICATION_ID`, `_SHARED_SECRET`, `_REFRESH_TOKEN`, `_PROFILE_ID` | ChannelAdvisor, Ireland account |
| `GATSBY_MIRAKL_TESCO_API_KEY`, `_BASE_URL`                                        | Tesco (Mirakl)                  |
| `GATSBY_MIRAKL_SUPERDRUG_API_KEY`, `_BASE_URL`                                    | Superdrug (Mirakl)              |
| `GATSBY_HELM_BASE_URL`, `_EMAIL`, `_PASSWORD`                                     | Holland & Barrett (DC/Helm)     |

The H&B values are the same as `DC_API_BASE_URL`, `HELM_EMAIL` and
`HELM_PASSWORD` in the `holland-and-barrett-helm-order-feeding-automation`
project.

### API

```text
GET /api/today-sales?range=today|yesterday|last30
GET /api/today-sales?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/today-sales?range=today&refresh=1
```

Returns `{ from, to, channels: [{ key, label, currency, orderCount, revenue, error? }] }`.
An unknown range, a bad date or a range that ends before it starts returns a
400 with a message.

```text
GET /api/supplier-sales?channel=amazon_uk&range=yesterday
GET /api/supplier-sales?channel=tesco&from=YYYY-MM-DD&to=YYYY-MM-DD
```

Returns `{ channel, label, currency, from, to, sections: [{ label, suppliers: [{ name, units, revenue, lines }] }] }`, where `label` is FBM/FBA for Amazon UK and null elsewhere,
largest revenue first. It takes the same range parameters as `today-sales`.
Helm limits how fast it can be called, so the first request for a lot of new
SKUs can take a while; looked-up SKUs are remembered for an hour.

## Layout

- `src/api/today-sales.js`: the Gatsby Function. Reads the credentials, validates the range and returns the per-channel numbers. Every file in `src/api/` becomes an endpoint, so helpers live in `src/server/` instead.
- `src/api/supplier-sales.js`: the Gatsby Function behind the supplier breakdown. `src/server/supplierSales.js` reads a channel's order lines and `src/server/suppliers.js` looks the SKUs up in Helm.
- `src/server/sales.js`: works out which days are missing from the cache, fetches them from every channel at once, and totals them.
- `src/server/channels.js`: the channel list (keys, labels, currencies, ChannelAdvisor site names).
- `src/server/channelAdvisor.js`, `mirakl.js`, `helm.js`: one client per source.
- `src/server/http.js`, `pagination.js`: JSON requests with retries and a timeout, and offset-based paging.
- `src/server/dates.js`, `cache.js`: London-day helpers and the per-day cache.
- `src/pages/index.js`: the page. Holds the selected range and loads the data.
- `src/hooks/useSales.js`: fetches the API, with loading, error and retry.
- `src/components/`: `Header` (range buttons), `DatePicker`, `RangeForm`, `KpiCards`, `ChannelGrid`, `ChannelCard`, `ChannelLogo`, `ChannelPie`, `SupplierPanel`, `SalesReport`, `SkeletonGrid`, `Notice`, `SectionHead`.
- `src/constants/`: the range titles, channel colours (`dashboard.js`) and logo map (`channelLogos.js`). A channel's colour is fixed to the channel, so it doesn't change when the others are filtered.
- `src/images/channels/`: the channel logos. A channel without one (Superdrug) shows a lettered badge.
- `src/styles/dashboard.css`: all the styles, with light and dark themes.
- `support/`: the Mirakl Connect and Rithum API reference files.
