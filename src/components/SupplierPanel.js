import * as React from "react";
import ChannelLogo from "./ChannelLogo";
import Notice from "./Notice";
import { CHANNEL_COLORS } from "../constants/dashboard";
import { useSupplierSales } from "../hooks/useSupplierSales";
import { count, money } from "../utils/format";

const SupplierTable = ({ data }) => {
  const total = data.suppliers.reduce((sum, s) => sum + s.revenue, 0);
  const totalUnits = data.suppliers.reduce((sum, s) => sum + s.units, 0);
  if (!data.suppliers.length) {
    return <Notice>No items were sold on this channel in this period.</Notice>;
  }
  return (
    <div className="table-wrap">
      <table className="supplier-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th className="num">Units</th>
            <th className="num">Revenue</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {data.suppliers.map((supplier) => {
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
                <td className="num">
                  {money(supplier.revenue, data.currency)}
                </td>
                <td className="num">{share.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{count(totalUnits)}</td>
            <td className="num">{money(total, data.currency)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const SupplierPanel = ({ channel, query, onClose }) => {
  const { data, error, loading, retry } = useSupplierSales(channel.key, query);

  React.useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="panel card"
        role="dialog"
        aria-modal="true"
        aria-label={`${channel.label} sales by supplier`}
        style={{ "--channel": CHANNEL_COLORS[channel.key] }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-head">
          <div className="channel-name">
            <ChannelLogo channelKey={channel.key} label={channel.label} />
            {channel.label} by supplier
          </div>
          <button type="button" className="panel-close" onClick={onClose}>
            Close
          </button>
        </div>
        {loading && (
          <div className="panel-loading">Loading supplier sales...</div>
        )}
        {error && (
          <Notice error onRetry={retry}>
            Failed to load: {error}
          </Notice>
        )}
        {data && <SupplierTable data={data} />}
        <p className="panel-note">
          Units are the quantity sold times the pack quantity of bundles.
          Revenue is the item price, so it leaves out postage and won't match
          the channel total. Suppliers come from Helm.
        </p>
      </div>
    </div>
  );
};

export default SupplierPanel;
