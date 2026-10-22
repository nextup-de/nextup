import React from "react";
/** One grey pulsing box standing in for content that has not arrived. */
export function Skeleton({ w, h = 14, r = "sm", dark, style }) {
  return <span className="nh-skel" data-r={r} data-dark={dark ? "true" : undefined} style={{ width: w, height: h, ...style }} aria-hidden="true" />;
}
