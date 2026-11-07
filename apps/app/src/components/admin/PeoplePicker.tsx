"use client";
// The people dropdown of /admin People: closed it is one line however large the company is. Open it
// searches by name, email or role and ticks any number of people. ↑↓ move, ↵ ticks, esc clears the
// text, then closes.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PersonRow } from "@/features/admin/rows";
import { searchPeople } from "@/features/admin/list";
import { PersonFace } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import c from "@/app/admin/people/console.module.css";
import s from "./lists.module.css";

/** A browser stays quick with this many rows; "select all" still reaches everyone the search found. */
const SHOWN = 100;

export function PeoplePicker({ people, selected, onChange }: { people: readonly PersonRow[]; selected: readonly string[]; onChange: (ids: string[]) => void }) {
  const t = useT();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const found = useMemo(() => searchPeople(people, query), [people, query]);
  const shown = found.slice(0, SHOWN);
  const allChosen = found.length > 0 && found.every((p) => chosen.has(p.id));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleFound = () => {
    const ids = new Set(found.map((p) => p.id));
    onChange(allChosen ? selected.filter((x) => !ids.has(x)) : [...new Set([...selected, ...ids])]);
  };
  const move = (to: number) => {
    const next = Math.min(Math.max(0, to), shown.length - 1);
    setCursor(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(cursor + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(cursor - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const p = shown[cursor]; if (p) toggle(p.id); }
    else if (e.key === "Escape") {
      e.preventDefault();
      if (query) { setQuery(""); setCursor(0); }
      else { setOpen(false); trigger.current?.focus(); }
    }
  };

  const one = selected.length === 1 ? people.find((p) => p.id === selected[0]) : undefined;
  const label = one ? one.name : selected.length ? t("adminConsole.pickerSelected", { n: selected.length }) : t("adminConsole.pickerPlaceholder");

  return (
    <div ref={box} className={s.picker}>
      <button
        ref={trigger}
        type="button"
        className={s.trigger}
        data-empty={selected.length ? undefined : ""}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("adminConsole.pickerLabel")}: ${label}`}
        data-testid="console-people-picker"
        onClick={() => setOpen(!open)}
      >
        <span className={s.triggerText}>{label}</span>
        <span className={s.caret} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className={s.panel}>
          <input
            ref={input}
            className={s.search}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown.length ? optionId(cursor) : undefined}
            aria-label={t("adminConsole.pickerSearch")}
            placeholder={t("adminConsole.pickerSearch")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKey}
          />
          <div className={s.panelTools}>
            <span role="status">{t("adminConsole.pickerCount", { n: found.length })}</span>
            <button type="button" className={s.link} disabled={found.length === 0} onClick={toggleFound}>
              {t(allChosen ? "adminConsole.pickerNoneAll" : "adminConsole.pickerAll", { n: found.length })}
            </button>
          </div>
          {found.length === 0 ? <p className={s.capped}>{t("adminConsole.pickerEmpty")}</p> : (
            <ul id={listId} className={s.options} role="listbox" aria-multiselectable="true" aria-label={t("adminConsole.pickerLabel")}>
              {shown.map((p, i) => (
                <li
                  key={p.id}
                  id={optionId(i)}
                  className={s.option}
                  role="option"
                  aria-selected={chosen.has(p.id)}
                  data-cursor={i === cursor ? "" : undefined}
                  onClick={() => { setCursor(i); toggle(p.id); }}
                  onPointerMove={() => { if (i !== cursor) setCursor(i); }}
                >
                  <span className={s.box} aria-hidden="true">✓</span>
                  <PersonFace name={p.name} size="sm" />
                  <span className={s.optionText}>
                    <span className={c.strong}>{p.name}{p.active ? null : <span className={s.tag}>{t("adminConsole.pickerInactive")}</span>}</span>
                    <span className={c.sub}>{p.role} · {p.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {found.length > SHOWN ? <p className={s.capped}>{t("adminConsole.pickerCapped", { shown: SHOWN, total: found.length })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
