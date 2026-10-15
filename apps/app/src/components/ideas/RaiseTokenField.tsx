"use client";
// The description on the raise start page: text with round coloured tokens in it (Impact, Deadline, ...).
// The value stays plain text with *Label* runs; a prompt button inserts a token at the caret, and typing
// *some text* turns into one by itself. Enter is a new line; Ctrl/Cmd+Enter sends.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { hasToken, parseParts, toneOf, TOKEN } from "./raiseTokens";
import s from "./Raise.module.css";

export type TokenFieldHandle = { insert: (label: string) => void; focus: () => void };

function makeToken(label: string) {
  const el = document.createElement("span");
  el.className = s.token;
  el.contentEditable = "false";
  el.dataset.token = label;
  el.dataset.tone = toneOf(label);
  el.textContent = label;
  return el;
}

function serialize(root: HTMLElement): string {
  let out = "";
  root.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += (n.textContent ?? "").replace(/ /g, " ");
    else if (n instanceof HTMLElement && n.dataset.token) out += "*" + n.dataset.token + "*";
    else if (n instanceof HTMLBRElement) { if (n !== root.lastChild) out += "\n"; } // the last one only keeps the line open
    else if (n instanceof HTMLElement) out += (out && !out.endsWith("\n") ? "\n" : "") + serialize(n); // a block the browser made
  });
  return out;
}

function fill(root: HTMLElement, value: string) {
  const nodes = parseParts(value).flatMap((p): Node[] => {
    if ("token" in p) return [makeToken(p.token)];
    return p.text.split("\n").flatMap((line, i) => [...(i ? [document.createElement("br")] : []), ...(line ? [document.createTextNode(line)] : [])]);
  });
  if (nodes[nodes.length - 1] instanceof HTMLBRElement) nodes.push(document.createElement("br")); // the last break only keeps the line open
  root.replaceChildren(...nodes);
}

// Typed *text*: the first complete run in any text node becomes a token, and the caret moves behind it.
function convert(root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    TOKEN.lastIndex = 0;
    const m = TOKEN.exec(text);
    if (!m || !m[1].trim()) continue;
    const node = n as Text;
    const sel = window.getSelection();
    const caret = sel && sel.rangeCount && sel.anchorNode === node ? sel.anchorOffset : -1; // the caret may be past the run: pasted or dictated text arrives whole
    const end = m.index + m[0].length;
    const after = node.splitText(end);
    node.splitText(m.index).remove(); // the typed *run*; what came before stays in `node`
    const tok = makeToken(m[1].trim());
    after.before(tok);
    const spaced = /^\s/.test(after.textContent ?? "");
    if (!spaced) after.textContent = " " + (after.textContent ?? "");
    if (sel && caret >= 0) {
      const r = document.createRange();
      if (caret <= m.index) r.setStart(node, caret);
      else r.setStart(after, Math.min(after.length, Math.max(caret - end, 0) + (spaced ? 0 : 1) + (spaced && caret <= end ? 1 : 0)));
      r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    }
    return true;
  }
  return false;
}

export const RaiseTokenField = forwardRef<TokenFieldHandle, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
}>(function RaiseTokenField({ value, onChange, onSubmit, placeholder }, ref) {
  const el = useRef<HTMLDivElement>(null);

  // Draw the value when it changed from outside (a restored draft, a dev fill, dictation, a sent idea).
  // While the field has the caret it is the source of truth: a late echo of an earlier keystroke must not reset it.
  useEffect(() => { const r = el.current; if (r && document.activeElement !== r && serialize(r) !== value) fill(r, value); }, [value]);

  const emit = useCallback(() => {
    const r = el.current;
    if (!r) return;
    while (convert(r)) { /* every typed run */ }
    const v = serialize(r);
    if (!v && r.childNodes.length) r.replaceChildren(); // lets the placeholder back in after the last delete
    onChange(v);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    insert: (label) => {
      const r = el.current;
      if (!r) return;
      r.focus();
      if (hasToken(serialize(r), label)) return;
      const sel = window.getSelection();
      let range = sel && sel.rangeCount && r.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
      if (!range) { range = document.createRange(); range.selectNodeContents(r); range.collapse(false); }
      range.deleteContents();
      const tok = makeToken(label), gap = document.createTextNode(" ");
      range.insertNode(gap); range.insertNode(tok);
      const s2 = window.getSelection();
      if (s2) { const c = document.createRange(); c.setStart(gap, 1); c.collapse(true); s2.removeAllRanges(); s2.addRange(c); }
      emit();
    },
  }), [emit]);

  return (
    <div ref={el} className={s.desc} contentEditable role="textbox" aria-multiline="true" aria-label={placeholder} data-placeholder={placeholder} suppressContentEditableWarning
      onInput={emit}
      onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { onSubmit(); return; }
        // Our own line break: the browser would split the field into blocks.
        const sel = window.getSelection(), r = el.current;
        if (!sel || !sel.rangeCount || !r) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const nl = document.createElement("br");
        range.insertNode(nl);
        r.normalize();
        if (!nl.nextSibling) r.append(document.createElement("br")); // a break at the very end only shows with another behind it
        const c = document.createRange();
        c.setStartAfter(nl); c.collapse(true);
        sel.removeAllRanges(); sel.addRange(c);
        emit();
      }} />
  );
});
