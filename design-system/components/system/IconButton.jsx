import React from "react";
/** Round icon-only button: dark close (×), grey fill, ghost, or outlined square for the composer add-ons. */
export function IconButton({ variant = "fill", size, label, onClick, children }) {
  return <button type="button" className="nu-icon-btn" data-variant={variant} data-size={size} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}
