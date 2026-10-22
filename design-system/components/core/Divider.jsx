import React from "react";
/** A hairline either side of a small word - "or" between two ways in. */
export function Divider({ children = "or" }) {
  return <div className="nh-divider">{children}</div>;
}
