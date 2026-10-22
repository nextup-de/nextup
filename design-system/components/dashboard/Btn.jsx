import React from "react";
/** The decision row's buttons: equal widths, 10px-ish corners, blue for the one that moves it on. */
export function Btn({ kind, onClick, children, fixed }) {
  return <button type="button" className="nh-ui-btn" data-kind={kind} data-fixed={fixed ? "true" : undefined} onClick={kind === "disabled" ? undefined : onClick} disabled={kind === "disabled"}>{children}</button>;
}
