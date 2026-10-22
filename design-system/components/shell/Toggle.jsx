import React from "react";
/** The handoff screens' pill controls: dark toggles (Sort, Support), white filter chips with counts. */
export function Toggle({ tone = "dark", size, icon, count, onClick, children, ariaLabel }) {
  return (
    <button type="button" className="nh-toggle" data-tone={tone} data-size={size} data-icon={!children ? "true" : undefined} onClick={onClick} aria-label={ariaLabel}>
      {icon}{children}{count != null && <span className="nh-toggle-count">{count}</span>}
    </button>
  );
}
export function FilterChip({ on, count, onClick, children }) {
  return (
    <button type="button" className="nh-filter" data-on={on ? "true" : undefined} aria-pressed={!!on} onClick={onClick}>
      {children}{count != null && <span className="nh-filter-count">{count}</span>}
    </button>
  );
}
