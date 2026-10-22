import React from "react";
/** Seven-bar sparkline. Grey bars = before the baseline, ink = since. Values 0-1. */
export function Bars({ spark = [], tone, size, flat }) {
  const vals = flat ? [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] : spark;
  return (
    <div className="nh-ui-bars" data-size={size}>
      {vals.map((v, i) => <div key={i} className="nh-ui-bar" data-tone={flat ? "flat" : tone ?? (i < 3 ? "before" : undefined)} style={{ height: 4 + v * 20 }} />)}
    </div>
  );
}
