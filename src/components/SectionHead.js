import * as React from "react";

const formatTime = (date) =>
  date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const SectionHead = ({ title, from, to, updatedAt, onRefresh, refreshing }) => (
  <div className="section-head">
    <div className="section-title">
      <h2>{title}</h2>
      {onRefresh && (
        <button
          type="button"
          className="refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      )}
      {updatedAt && (
        <span className="updated-at">Last updated {formatTime(updatedAt)}</span>
      )}
    </div>
    {from && (
      <span className="range-label">
        {from === to ? from : `${from} to ${to}`}
      </span>
    )}
  </div>
);

export default SectionHead;
