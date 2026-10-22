import React from "react";
/** One chat line. user = black bubble right; ai = plain text left; them = a named person's grey bubble with avatar. */
export function ChatMessage({ role = "ai", text, initials, tone, when }) {
  if (role === "them") return (
    <div className="nu-msg" data-role="them">
      <span className="nu-av" data-avatar={tone} style={{ width: 28, height: 28, fontSize: 12 }}>{initials}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><p className="nu-bubble">{text}</p>{when && <span className="nu-msg-when">{when}</span>}</div>
    </div>
  );
  return <div className="nu-msg" data-role={role}><p className="nu-bubble">{text}</p></div>;
}
/** The vertical turn rail beside the coach chat. */
export function ProgressRail({ count, current, onPick }) {
  return (
    <div className="nu-rail">
      {Array.from({ length: count }, (_, i) => {
        const s = i + 1 === current ? "now" : i + 1 < current ? "done" : "todo";
        return <button key={i} type="button" className="nu-rail-dot" data-s={s} onClick={() => onPick && onPick(i + 1)} aria-label={"Turn " + (i + 1)}>{s === "now" ? current : s === "done" ? <svg width="8" height="8" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</button>;
      })}
    </div>
  );
}
