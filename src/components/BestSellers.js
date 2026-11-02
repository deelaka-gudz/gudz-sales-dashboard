import * as React from "react";
import { count } from "../utils/format";

// `best` is { bestSku, bestProduct } (or { error }); `state` is the hook result
// while it is still loading or failed.
export const bestLines = (best) => [
  {
    label: "Best selling SKU",
    item: best?.bestSku,
    detail: (item) => `${count(item.orders)} orders`,
  },
  {
    label: "Best selling product",
    item: best?.bestProduct,
    detail: (item) => `${count(item.units)} units`,
  },
];

const statusText = ({ loading, error }, best) => {
  if (loading) return "Loading...";
  if (error || best?.error) return "Unavailable";
  return "No sales";
};

export const BestKpi = ({ label, item, detail, status, best }) => (
  <div className="card kpi-best">
    <div className="kpi-label">★ {label}</div>
    <div className="kpi-value kpi-text" title={item?.name}>
      {item ? item.name : statusText(status, best)}
    </div>
    {item && (
      <div className="kpi-sub" title={item.title}>
        {detail(item)}
        {item.title && ` · ${item.title}`}
      </div>
    )}
  </div>
);

export const ChannelBest = ({ best, status }) => (
  <div className="channel-best">
    {bestLines(best).map(({ label, item, detail }) => (
      <div key={label} className="channel-best-row">
        <span className="channel-best-label">{label}</span>
        <span className="channel-best-value" title={item?.title}>
          {item ? item.title || item.name : statusText(status, best)}
        </span>
        {item && (
          <span className="channel-best-meta">
            {item.name} · {detail(item)}
          </span>
        )}
      </div>
    ))}
  </div>
);
