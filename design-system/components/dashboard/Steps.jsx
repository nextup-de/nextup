import React from "react";
/** The four steps of anything sent: a thin bar each - ink when done, blue for now, red when late. */
export function Steps({ steps }) {
  return (
    <ol className="nh-ui-steps" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.label} className="nh-ui-step" data-tone={s.tone}>
          <span className="nh-ui-step-bar" />
          <span className="nh-ui-step-label">{s.label}</span>
          <span className="nh-ui-step-when">{s.when}</span>
        </li>
      ))}
    </ol>
  );
}
