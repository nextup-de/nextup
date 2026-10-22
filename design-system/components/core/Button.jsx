import React from "react";
/** Form button: black primary, white hairline ghost, grey fill. 44px tall, 34px small. */
export function Button({ variant = "primary", size = "md", block, href, type = "button", onClick, disabled, children, className, style }) {
  const cls = ["nh-btn", "nh-btn-" + variant, size === "sm" && "nh-btn-sm", block && "nh-btn-block", className].filter(Boolean).join(" ");
  if (href !== undefined) return <a href={href} className={cls} style={style}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls} style={style}>{children}</button>;
}
