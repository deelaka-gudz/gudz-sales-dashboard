import * as React from "react";
import ChannelCard from "./ChannelCard";

const ChannelGrid = ({ channels, revenueByCurrency, days, best, onSelect }) => (
  <div className="channels">
    {channels.map((channel) => (
      <ChannelCard
        key={channel.key}
        channel={channel}
        days={days}
        best={best}
        onSelect={onSelect}
        currencyTotal={revenueByCurrency[channel.currency] || 0}
      />
    ))}
  </div>
);

export default ChannelGrid;
