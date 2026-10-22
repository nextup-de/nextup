import React from "react";
/** The new system's button: a pill. dark = the action, fill = the alternatives, light = on the Ground, outline = done. */
export function PillButton({ variant = "dark", size, block, icon, count, href, onClick, disabled, children, style }) {
  const p = { className: "nu-btn", "data-variant": variant, "data-size": size, "data-block": block ? "true" : undefined, style };
  const inner = <>{icon}{children}{count != null && <span className="nu-btn-count">{count}</span>}</>;
  if (href) return <a href={href} {...p}>{inner}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} {...p}>{inner}</button>;
}
