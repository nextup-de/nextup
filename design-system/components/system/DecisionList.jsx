import React from "react";
/** "Your decision": one row per way to answer. The picked one goes black; the AI's advice wears a sparkle tag. */
export function DecisionList({ title = "Your decision", options, value, suggested, onPick }) {
  return (
    <div className="nu-card" data-pad="sm">
      <h3 className="nu-card-title">{title}</h3>
      <div className="nu-actions">
        {options.map((o) => (
          <button key={o} type="button" className="nu-action" data-primary={value === o ? "true" : undefined} onClick={() => onPick && onPick(o)}>
            {o}{suggested === o && <span className="nu-suggest"><svg width="9" height="9" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>AI suggests</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
