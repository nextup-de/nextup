import React from "react";
/** One score tile: label, a 270° blue arc out of 100, and the black chevron that opens its reasoning. */
export function ScoreGauge({ label, value, open, onToggle }) {
  const fill = ((value / 100) * 141.4).toFixed(1);
  return (
    <div className="nu-score" data-open={open ? "true" : undefined}>
      <span className="nu-score-label">{label}</span>
      <div className="nu-gauge">
        <svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" className="t" strokeDasharray="141.4 188.5" /><circle cx="36" cy="36" r="30" className="f" strokeDasharray={fill + " 188.5"} /></svg>
        <div className="nu-gauge-text"><span className="nu-gauge-num">{value}</span><span className="nu-gauge-sub">/ 100</span></div>
        <button type="button" className="nu-gauge-btn" aria-label={"Why " + label} onClick={onToggle}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></button>
      </div>
    </div>
  );
}
/** The row of five. */
export function ScoreRow({ scores, open, onToggle }) {
  return <div className="nu-scores">{scores.map((s) => <ScoreGauge key={s.label} label={s.label} value={s.value} open={open === s.label} onToggle={() => onToggle && onToggle(s.label)} />)}</div>;
}
