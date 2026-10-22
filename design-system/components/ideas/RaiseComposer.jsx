import React from "react";
import { Icon } from "../icons/Icon.jsx";
import { Initials } from "../dashboard/Avatar.jsx";
const PRESETS = ["Impact", "Who\u2019s blocked", "Already tried", "Trial", "Deadline"];
/** The gold-ringed composer: actions bolt, a growing field, dictation and send; chips and a prompt tray under it. */
export function RaiseComposer({ value, onChange, onSubmit, placeholder = "Share an idea that would make work better\u2026", chips = [], tray = true, onPreset }) {
  const [v, setV] = React.useState("");
  const val = value ?? v, set = onChange ?? setV;
  const ready = val.trim().length >= 3;
  return (
    <div className="nh-composer">
      <div className="nh-composer-aura" />
      <div className="nh-composer-ring">
        <div className="nh-composer-inner">
          <div className="nh-composer-row">
            <button type="button" className="nh-composer-kind" aria-label="Actions"><Icon name="bolt" size={10.5} color="#1c1c1e" solid /></button>
            <textarea className="nh-composer-field" rows={1} value={val} placeholder={placeholder} aria-label={placeholder}
              onChange={(e) => set(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ready && onSubmit) onSubmit(val); } }} />
            <button type="button" className="nh-composer-dictate" aria-label="Dictate"><Icon name="mic" size={13.5} width={2} /></button>
            <button type="button" className="nh-composer-send" data-ready={ready} disabled={!ready} aria-label="Send" onClick={() => onSubmit && onSubmit(val)}><Icon name="up" size={11.25} color="#fff" width={2.6} /></button>
          </div>
          {chips.length ? (
            <div className="nh-composer-strip">
              {chips.map((c) => (
                <span key={c.title} className="nh-composer-chip">
                  <span className="nh-composer-lead" data-kind={c.kind} data-avatar={c.tone}>{c.icon ? <Icon name={c.icon} size={12} /> : Initials(c.title)}</span>
                  <span className="nh-composer-chiptext"><span className="nh-composer-chiptitle">{c.title}</span><span className="nh-composer-chipsub">{c.sub}</span></span>
                </span>
              ))}
            </div>
          ) : <div className="nh-composer-spacer" />}
        </div>
      </div>
      {tray && (
        <div className="nh-composer-tray"><div className="nh-composer-trayrow">
          <button type="button" className="nh-composer-traybtn" data-custom="" onClick={() => onPreset && onPreset("")}><Icon name="plus" size={7.5} width={3} />Custom</button>
          {PRESETS.map((p) => <button key={p} type="button" className="nh-composer-traybtn" onClick={() => onPreset && onPreset(p)}><Icon name="plus" size={7.5} width={3} />{p}</button>)}
        </div></div>
      )}
    </div>
  );
}
