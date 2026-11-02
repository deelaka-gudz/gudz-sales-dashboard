import * as React from "react";
import ChannelCard from "./ChannelCard";

// How many tiles sit in each row of the grid right now.
const columnCount = (grid) =>
  grid
    ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean)
        .length
    : 1;

// `panel` is shown full width at the start of the row of the `selectedKey`
// tile, and that tile is hidden while its panel is open.
const ChannelGrid = ({
  channels,
  revenueByCurrency,
  onSelect,
  selectedKey,
  panel,
}) => {
  const grid = React.useRef(null);
  const [columns, setColumns] = React.useState(1);

  React.useEffect(() => {
    const update = () => setColumns(columnCount(grid.current));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const selectedIndex = channels.findIndex((c) => c.key === selectedKey);
  const panelBefore =
    selectedIndex < 0 ? -1 : Math.floor(selectedIndex / columns) * columns;

  return (
    <div className="channels" ref={grid}>
      {channels.map((channel, index) => (
        <React.Fragment key={channel.key}>
          {index === panelBefore && panel}
          {index !== selectedIndex && (
            <ChannelCard
              channel={channel}
              onSelect={onSelect}
              currencyTotal={revenueByCurrency[channel.currency] || 0}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default ChannelGrid;
