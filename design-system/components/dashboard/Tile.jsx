import React from "react";
/** A stat inside a card: hairline above, no box - a card never holds another box. */
export function Tile({ v, l, hot, onClick }) {
  return (
    <div className="nh-ui-tile" data-click={onClick ? "true" : undefined} onClick={onClick}>
      <div className="nh-ui-tile-v" data-hot={hot ? "true" : undefined}>{v}</div>
      <div className="nh-ui-tile-l">{l}</div>
    </div>
  );
}
/** A row of numbers: one box, hairlines between - not one card per number. */
export function Stats({ items }) {
  return (
    <div className="nh-ui-stats">
      {items.map((k) => (
        <div key={k.l} className="nh-ui-stat">
          <div className="nh-ui-stat-v" data-hot={k.hot ? "true" : undefined}>{k.v}</div>
          <div className="nh-ui-stat-l">{k.l}</div>
        </div>
      ))}
    </div>
  );
}
