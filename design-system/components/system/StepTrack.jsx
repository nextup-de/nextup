import React from "react";
/** Where an idea is: five thin bars - ink when done, blue for now, grey still to come. */
export function StepTrack({ steps }) {
  return (
    <ol className="nu-steps" aria-label="Progress">
      {steps.map((s) => <li key={s.label} className="nu-step" data-tone={s.tone}><span className="nu-step-bar" /><span className="nu-step-text"><span className="nu-step-label">{s.label}</span><span className="nu-step-sub">{s.sub}</span></span></li>)}
    </ol>
  );
}
/** The strip under it: whose desk it is on and how much of the promise is used. */
export function DeskStrip({ name, role, initials, tone, used = 0, label }) {
  return (
    <div className="nu-desk">
      <span>On the desk of</span>
      <span className="nu-desk-who"><span className="nu-av" data-avatar={tone} style={{ width: 24, height: 24, fontSize: 12 }}>{initials}</span>{name} <span className="nu-desk-role">{role}</span></span>
      <span className="nu-desk-clock"><span className="nu-desk-track"><span className="nu-desk-fill" data-late={used > 1 ? "true" : undefined} style={{ width: Math.min(1, used) * 100 + "%" }} /></span>{label}</span>
    </div>
  );
}
