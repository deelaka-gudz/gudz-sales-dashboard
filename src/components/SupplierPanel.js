import * as React from "react";
import { ChannelBest } from "./BestSellers";
import ChannelLogo from "./ChannelLogo";
import Notice from "./Notice";
import { CHANNEL_COLORS } from "../constants/dashboard";
import { useSupplierSales } from "../hooks/useSupplierSales";
import { count, money } from "../utils/format";

const VIEWS = {
  suppliers: { button: "Supplier", noun: "supplier" },
  manufacturers: { button: "Brand", noun: "brand" },
};

const SupplierTable = ({ suppliers, currency, heading, limit }) => {
  const [expanded, setExpanded] = React.useState(false);
  const total = suppliers.reduce((sum, s) => sum + s.revenue, 0);
  const totalUnits = suppliers.reduce((sum, s) => sum + s.units, 0);
  const hidden = limit && !expanded ? suppliers.length - limit : 0;
  const shown = hidden > 0 ? suppliers.slice(0, limit) : suppliers;
  if (!suppliers.length) {
    return <Notice>No items were sold on this channel in this period.</Notice>;
  }
  return (
    <div className="table-wrap">
      <table className="supplier-table">
        <thead>
          <tr>
            <th>{heading}</th>
            <th className="num">Units</th>
            <th className="num">Orders</th>
            <th className="num">Revenue</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((supplier) => {
            const share = total ? (supplier.revenue / total) * 100 : 0;
            return (
              <tr key={supplier.name}>
                <td>
                  <div className="supplier-name">{supplier.name}</div>
                  <div className="share">
                    <div style={{ width: `${share}%` }} />
                  </div>
                </td>
                <td className="num">{count(supplier.units)}</td>
                <td className="num">{count(supplier.orders)}</td>
                <td className="num">{money(supplier.revenue, currency)}</td>
                <td className="num">{share.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{count(totalUnits)}</td>
            <td />
            <td className="num">{money(total, currency)}</td>
          </tr>
        </tfoot>
      </table>
      {limit && suppliers.length > limit && (
        <button
          type="button"
          className="show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
};

// Brands are many, so only the top ones are listed until the user asks for more.
const BRAND_LIMIT = 10;

const SupplierSections = ({ data, view }) =>
  data.sections.map((section) => (
    <section key={section.label || "all"} className="panel-section">
      {section.label && <h3>{section.label}</h3>}
      <ChannelBest best={section} status={{}} />
      <SupplierTable
        suppliers={section[view]}
        currency={data.currency}
        heading={VIEWS[view].button}
        limit={view === "manufacturers" ? BRAND_LIMIT : 0}
      />
    </section>
  ));

const SupplierPanel = ({ channel, query, onClose }) => {
  const { data, error, loading, retry } = useSupplierSales(channel.key, query);
  const [view, setView] = React.useState("suppliers");

  React.useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="panel card"
        role="dialog"
        aria-modal="true"
        aria-label={`${channel.label} sales by ${VIEWS[view].noun}`}
        style={{ "--channel": CHANNEL_COLORS[channel.key] }}
      >
        <div className="panel-head">
          <div className="channel-name">
            <ChannelLogo channelKey={channel.key} label={channel.label} />
            {channel.label} by {VIEWS[view].noun}
          </div>
          <button type="button" className="panel-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="segmented panel-toggle">
          {Object.entries(VIEWS).map(([key, { button }]) => (
            <button
              key={key}
              type="button"
              className={key === view ? "active" : ""}
              onClick={() => setView(key)}
            >
              {button}
            </button>
          ))}
        </div>
        {loading && (
          <div className="panel-loading">Loading supplier sales...</div>
        )}
        {error && (
          <Notice error onRetry={retry}>
            Failed to load: {error}
          </Notice>
        )}
        {data && <SupplierSections data={data} view={view} />}
        <p className="panel-note">
          Units are the quantity sold times the pack size (the "Unit Count" in
          ChannelAdvisor). Orders count each order once per row, so rows can add
          up to more than the channel total. Revenue is the item price, so it
          leaves out postage and won't match the channel total. Suppliers and
          brands come from ChannelAdvisor; only Holland &amp; Barrett
          uses Helm.
        </p>
      </div>
    </div>
  );
};

export default SupplierPanel;
