"use client";
// The gold-ringed composer, on the start page and under the chat: actions button, a field that grows,
// dictation (Web Speech API, where the browser has it) and send. Enter sends, Shift+Enter is a new line.
// On a demo-stage company `fill` puts the demo script's next text in the field (features/ideas/demo-script).
import { useEffect, useRef, useState } from "react";
import { Icon, Mic, Solid } from "./raiseIcons";
import { PersonButton } from "./RaisePerson";
import s from "./Raise.module.css";

export type Chip = { key: string; title: string; sub: string; kind: "person" | "meeting" | "file" | "affected" | "private" | "custom"; person?: string; lead: string; img?: string; icon?: "meeting" | "affected" | "lock"; open: () => void; remove: () => void };

// The few members of the Web Speech API this page uses - lib.dom does not type it yet.
type SpeechResult = { 0: { transcript: string } };
type SpeechEvent = { results: ArrayLike<SpeechResult> };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: SpeechEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type RecognitionCtor = new () => Recognition;
const speechCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function RaiseComposer({ value, onChange, onSubmit, placeholder, canSend, sendLabel, fieldRef, chips, strip, menuOpen, onMenu, menu, onUnsupported, fill }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  canSend: boolean;
  sendLabel: string;
  fieldRef?: React.RefObject<HTMLTextAreaElement | null>;
  chips: Chip[];
  strip: boolean; // the start page shows the chips; the chat keeps their height empty
  menuOpen: boolean;
  onMenu: () => void;
  menu: React.ReactNode;
  onUnsupported: () => void;
  fill?: { label: string; text: string } | null;
}) {
  const [dictating, setDictating] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => () => rec.current?.abort(), []);

  // The right edge fades while chips run past it.
  const measure = () => { const el = stripRef.current; if (el) setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4); };
  useEffect(measure, [chips.length]);

  const dictate = () => {
    if (rec.current) { rec.current.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) { onUnsupported(); return; }
    const base = value.replace(/\s+$/, ""), pre = base ? base + " " : "";
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; onChange(pre + t.trim()); };
    r.onend = () => { if (rec.current === r) { rec.current = null; setDictating(false); } };
    r.onerror = () => r.stop();
    rec.current = r; r.start(); setDictating(true);
  };

  return (
    <div className={s.composer}>
      <div className={s.aura} />
      <div className={s.ring}>
        <div className={s.inner}>
          <div className={s.row}>
            <div className={s.kindWrap}>
              <button type="button" className={s.kind} onClick={onMenu} title="Actions" aria-label="Actions" aria-expanded={menuOpen}><Solid name="bolt" size={10.5} fill="#1c1c1e" /></button>
              {menuOpen && menu}
            </div>
            <textarea ref={fieldRef} className={s.field} rows={1} value={value} placeholder={placeholder} aria-label={placeholder}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); } }} />
            {fill && (
              <button type="button" className={s.fill} title={"Insert: " + fill.text} aria-label={"Insert the " + fill.label.toLowerCase()}
                onClick={() => { onChange(fill.text); setTimeout(() => { const el = fieldRef?.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } }, 0); }}>
                <Solid name="sparkle" size={9} fill="currentColor" /><span className={s.fillLabel}>{fill.label}</span>
              </button>
            )}
            <button type="button" className={s.dictate} onClick={dictate} aria-pressed={dictating} title={dictating ? "Stop dictation" : "Dictate"} aria-label="Dictate"><Mic size={13.5} /></button>
            <button type="button" className={s.send} data-ready={canSend} onClick={onSubmit} disabled={!canSend} title={sendLabel} aria-label={sendLabel}><Icon name="up" size={11.25} stroke="#fff" width={2.6} /></button>
          </div>
          {strip ? (
            <div ref={stripRef} className={s.strip} data-more={more} onScroll={measure}
              onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
              {chips.map((c) => (
                <span key={c.key} className={s.chip}>
                  {c.person && <PersonButton name={c.person} className={`${s.lead} ${s.leadBig}`}>{c.lead}</PersonButton>}
                  <button type="button" className={s.chipOpen} onClick={c.open} title="View or edit">
                    {!c.person && <span className={`${s.lead} ${s.leadBig}`} data-kind={c.kind} style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}>
                      {c.icon ? <Icon name={c.icon} size={12} /> : !c.img && c.lead}
                    </span>}
                    <span className={s.chipText}><span className={s.chipTitle}>{c.title}</span><span className={s.chipSub}>{c.sub}</span></span>
                  </button>
                  <button type="button" className={s.chipX} onClick={c.remove} title="Remove" aria-label={"Remove " + c.title}><Icon name="x" size={7.5} width={3} /></button>
                </span>
              ))}
            </div>
          ) : <div className={s.spacer} />}
        </div>
      </div>
    </div>
  );
}
