import React from "react";
/** An empty state: one bold line and one quiet line saying what happens next. */
export function Empty({ title, sub, children }) {
  return (
    <div className="nh-ui-empty">
      <div className="nh-ui-empty-title">{title}</div>
      <div className="nh-ui-empty-sub">{sub}</div>
      {children}
    </div>
  );
}
