import React from "react";
/** The grey label / value grid inside a card (Who, Worth, Owner on the map …). */
export function InfoPanel({ rows }) {
  return (
    <dl className="nu-panel">
      {rows.map((r) => <React.Fragment key={r.label}><dt>{r.label}</dt><dd>{r.value}{r.sub && <span className="nu-panel-sub">{r.sub}</span>}</dd></React.Fragment>)}
    </dl>
  );
}
/** Labelled horizontal bars in the same grey panel (What the AI found). */
export function BarsPanel({ title, rows, note }) {
  return (
    <div className="nu-bars">
      {title && <span className="nu-label">{title}</span>}
      {rows.map((r) => <div key={r.label} className="nu-bar-row"><span>{r.label}</span><span className="nu-track"><span className="nu-fill" style={{ width: Math.round(r.value * 100) + "%" }} /></span><span className="nu-bar-val">{r.display}</span></div>)}
      {note && <span className="nu-label">{note}</span>}
    </div>
  );
}
