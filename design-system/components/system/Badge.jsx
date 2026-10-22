import React from "react";
/** Tinted status badge: blue = time left, grey = late/paused, amber = under review / needs info, green = approved. */
export function Badge({ tone, size, children }) {
  return <span className="nu-badge" data-tone={tone} data-size={size}>{children}</span>;
}
