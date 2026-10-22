import React from "react";
/** Status pill. Amber = waiting on someone, green = yes, ink = live, grey = in work. Prefer Badge for new work. */
export function Pill({ tone = "soft", children }) {
  return <span className="nh-ui-pill" data-tone={tone}>{children}</span>;
}
/** The tone the app picks for a status word. */
export const statusTone = (s) => StatusTone(s);
export function StatusTone(s) {
  if (s === "Awaiting decision" || s === "Sent" || s === "Question for you" || s === "Waiting for an answer") return "accent";
  if (s === "Shipped" || s === "Live") return "ink";
  if (s === "Approved" || s === "Answered: yes") return "ok";
  if (s === "In trial" || s === "Building" || s === "Being built") return "grey";
  return "ghost";
}
