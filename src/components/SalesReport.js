import * as React from "react";
import ChannelGrid from "./ChannelGrid";
import ChannelPie from "./ChannelPie";
import KpiCards from "./KpiCards";
import Notice from "./Notice";
import SectionHead from "./SectionHead";
import SupplierPanel from "./SupplierPanel";
import { useBestSellers } from "../hooks/useBestSellers";
import { summarize } from "../utils/sales";

const SalesReport = ({ channels, query, onRetry }) => {
  const { totalOrders, revenueByCurrency, failed } = summarize(channels);
  const best = useBestSellers(query);
  const [selected, setSelected] = React.useState(null);
  const close = React.useCallback(() => setSelected(null), []);
  return (
    <>
      {failed.length > 0 && (
        <Notice error onRetry={onRetry}>
          {failed.map((channel) => channel.label).join(", ")} could not be
          loaded, so the totals below leave{" "}
          {failed.length === 1 ? "it" : "them"} out.
        </Notice>
      )}
      <KpiCards
        totalOrders={totalOrders}
        revenueByCurrency={revenueByCurrency}
        best={best}
      />
      <SectionHead title="By channel" />
      <ChannelGrid
        channels={channels}
        revenueByCurrency={revenueByCurrency}
        onSelect={setSelected}
      />
      <SectionHead title="Share by channel" />
      <ChannelPie channels={channels} />
      {selected && (
        <SupplierPanel channel={selected} query={query} onClose={close} />
      )}
    </>
  );
};

export default SalesReport;
