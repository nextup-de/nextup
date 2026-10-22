import React from "react";
/** The nh-input text field: 44px, white, hairline, blue focus ring. Optional suffix (e.g. ".nextup.app"). */
export function Input({ id, value, defaultValue, onChange, placeholder, type = "text", invalid, multiline, select, options, suffix, rows, style }) {
  const common = { id, value, defaultValue, placeholder, style, "aria-invalid": invalid ? true : undefined, onChange: onChange ? (e) => onChange(e.target.value) : undefined };
  let el;
  if (multiline) el = <textarea className="nh-input nh-textarea" rows={rows} {...common} />;
  else if (select) el = <select className="nh-input nh-select" {...common}>{(options || []).map((o) => <option key={o}>{o}</option>)}</select>;
  else el = <input className="nh-input" type={type} {...common} />;
  if (!suffix) return el;
  return <div className="nh-slug">{el}<span className="nh-slug-suffix">{suffix}</span></div>;
}
