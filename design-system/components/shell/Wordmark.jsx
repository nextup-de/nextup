import React from "react";
const RATIO = { horizontal: 494 / 212, stacked: 279 / 301, mark: 158 / 136 };
/** The NextUp logo - the real files in assets/brand, never redrawn. Default: horizontal, blue mark + black name (the app bar). */
export function Wordmark({ base = "assets/brand/", layout = "horizontal", tone = "blue", height = 28, style }) {
  const src = base + "nextup-" + layout + "-" + tone + ".png";
  return <img className="nh-wordmark" src={src} alt="NextUp" height={height} style={{ height, width: Math.round(height * RATIO[layout]), ...style }} />;
}
