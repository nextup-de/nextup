import React from "react";
/** Label + control + one line under it: a hint, or an error that replaces it. */
export function Field({ id, label, hint, error, labelRight, children }) {
  return (
    <div className="nh-field">
      {labelRight ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label className="nh-label" htmlFor={id}>{label}</label>{labelRight}
        </div>
      ) : <label className="nh-label" htmlFor={id}>{label}</label>}
      {children}
      {error ? (
        <p className="nh-error" id={id + "-error"} role="alert">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 4.75v3.9M8 11.1v.15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>{error}</span>
        </p>
      ) : hint ? <p className="nh-hint">{hint}</p> : null}
    </div>
  );
}
