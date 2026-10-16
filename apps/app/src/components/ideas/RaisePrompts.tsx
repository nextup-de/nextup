"use client";
// The start composer's prompts (Claude Design handoff "AI bar"): the mini bar tucked under the composer
// sets a labelled block - Impact, Who's blocked, ... or a custom label - into the text where the caret
// was. Enter in a block goes on in the text after it; Backspace in an empty block takes it out again.
// On send the body follows the headline as text and "*Label* text" lines (features/ideas/prompts.ts).
import { useEffect, useRef } from "react";
import { isBlock, PRESETS, removeBlock, type Caret, type Prompt, type Seg } from "@/features/ideas/prompts";
import { Icon } from "./raiseIcons";
import s from "./Raise.module.css";

// The field that takes the caret next: a piece of the body, which of a block's fields, and where (the end without pos).
export type BodyFocus = { seg: number; on: "label" | "text"; pos?: number };

// Inside the composer, under the headline: the free text and the blocks, in order.
export function PromptBody({ segs, onSegs, caretRef, focus, onFocus, headRef }: {
  segs: Seg[];
  onSegs: (segs: Seg[]) => void;
  caretRef: React.MutableRefObject<Caret | null>; // kept up to date here, read by the mini bar
  focus: BodyFocus | null;
  onFocus: (f: BodyFocus) => void;
  headRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    const el = box.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-seg="${focus.seg}"][data-f="${focus.on}"]`);
    if (!el) { headRef.current?.focus(); return; } // the last block taken out of an empty body
    el.focus();
    el.selectionStart = el.selectionEnd = focus.pos ?? el.value.length;
    caretRef.current = { seg: focus.seg, pos: el.selectionStart };
  }, [focus, caretRef, headRef]);
  // In the headline, a new block goes first in the body.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const at = () => { caretRef.current = { seg: -1, pos: 0 }; };
    el.addEventListener("focus", at);
    return () => el.removeEventListener("focus", at);
  }, [headRef, caretRef]);

  const set = (i: number, patch: Partial<Seg>) => onSegs(segs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const track = (i: number) => ({
    onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => { caretRef.current = { seg: i, pos: e.currentTarget.selectionStart ?? 0 }; },
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { caretRef.current = { seg: i, pos: e.currentTarget.selectionStart ?? 0 }; },
  });
  const remove = (i: number) => { const r = removeBlock(segs, i); onSegs(r.segs); onFocus({ seg: r.caret.seg, on: "text", pos: r.caret.pos }); };
  const plain = (e: React.KeyboardEvent) => !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing;
  const collapsed = (el: HTMLInputElement | HTMLTextAreaElement) => el.selectionStart === 0 && el.selectionEnd === 0;

  if (!segs.some(isBlock) && !segs[0]?.text) return null;
  return (
    <div ref={box} className={s.promptBody}>
      {segs.map((x, i) => isBlock(x) ? (
        <div key={x.id ?? i} className={s.prompt}>
          <input className={s.promptLabel} value={x.label} placeholder="Label" aria-label="Label" data-seg={i} data-f="label" {...track(i)}
            onChange={(e) => set(i, { label: e.target.value })}
            onKeyDown={(e) => {
              if (!plain(e)) return;
              if (e.key === "Enter") { e.preventDefault(); onFocus({ seg: i, on: "text" }); }
              else if (e.key === "Backspace" && !x.label && !x.text) { e.preventDefault(); remove(i); }
            }} />
          <textarea className={s.promptText} rows={1} value={x.text} placeholder="Add a line" aria-label={x.label || "Line"} data-seg={i} data-f="text" {...track(i)}
            onChange={(e) => set(i, { text: e.target.value })}
            onKeyDown={(e) => {
              if (!plain(e)) return;
              // Enter goes on after the block - on a line of its own when text follows already.
              if (e.key === "Enter") { e.preventDefault(); if (segs[i + 1].text) set(i + 1, { text: "\n" + segs[i + 1].text }); onFocus({ seg: i + 1, on: "text", pos: 0 }); }
              else if (e.key === "Backspace" && !x.text) { e.preventDefault(); if (x.custom && x.label) onFocus({ seg: i, on: "label" }); else remove(i); }
            }} />
          <span className={s.promptXWrap}>
            <button type="button" className={s.promptX} onClick={() => remove(i)} title="Remove" aria-label={"Remove " + (x.label || "block")}><Icon name="x" size={7.5} width={3} /></button>
          </span>
        </div>
      ) : (
        <textarea key={"t" + (segs[i - 1]?.id ?? "")} className={s.freeLine} rows={1} value={x.text} aria-label="More context" data-empty={!x.text || undefined}
          data-seg={i} data-f="text" {...track(i)}
          onChange={(e) => set(i, { text: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Backspace" && plain(e) && i > 0 && collapsed(e.currentTarget)) { e.preventDefault(); onFocus({ seg: i - 1, on: "text" }); } }} />
      ))}
    </div>
  );
}

// The mini bar under the composer: Custom first, then the presets - each can be added again and again.
// Pressing one keeps the caret where it was, so the block lands there.
export function PromptTray({ onAdd }: { onAdd: (p: Prompt) => void }) {
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className={s.tray}>
      <div className={s.trayRow}>
        <button type="button" className={s.trayBtn} data-custom="" onMouseDown={keep} onClick={() => onAdd({ label: "", text: "", custom: true })}><Icon name="plus" size={7.5} width={3} />Custom</button>
        {PRESETS.map((label) => (
          <button key={label} type="button" className={s.trayBtn} onMouseDown={keep} onClick={() => onAdd({ label, text: "" })}><Icon name="plus" size={7.5} width={3} />{label}</button>
        ))}
      </div>
    </div>
  );
}
