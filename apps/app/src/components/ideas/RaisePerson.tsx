"use client";
// A person on the raise page is a button: it opens the same small profile the other pages show
// (PersonCard, leader/IdeaParts.tsx). The card is drawn over the page, fixed beside the button, so the
// sidebar or a dialog never clips it. Anyone not on the org chart (a handle, a free name) stays plain.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PersonCard } from "@/components/dashboard/leader/IdeaParts";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { personFor } from "@/features/ideas/brief";
import s from "./Raise.module.css";

export const RaisePeople = createContext<{ people: readonly OrgPerson[]; depts: readonly Dept[] }>({ people: [], depts: [] });

const W = 280, GAP = 8;

export function PersonButton({ name, className, children, label }: { name: string; className?: string; children: React.ReactNode; label?: string }) {
  const { people, depts } = useContext(RaisePeople);
  const person = personFor(name, { people, depts, ideas: [] });
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null); // the page root the card is drawn into
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // Below the button, left-aligned, pulled inside the screen; above it when there is no room below.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const root = btn.current.closest<HTMLElement>("[data-raise-root]");
    if (root !== host) { setHost(root); return; }
    const r = btn.current.getBoundingClientRect(), h = pop.current?.offsetHeight ?? 220;
    const up = r.bottom + GAP + h > window.innerHeight - GAP && r.top - GAP - h > GAP;
    setAt({ x: Math.max(GAP, Math.min(r.left, window.innerWidth - W - GAP)), y: up ? r.top - GAP - h : r.bottom + GAP, up });
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key, true); };
  }, [open]);

  if (!person) return <span className={className}>{children}</span>;
  return (
    <>
      <button ref={btn} type="button" className={`${s.personBtn} ${className ?? ""}`} aria-expanded={open} aria-label={label ?? "Profile of " + name} title={label ?? "Profile of " + name}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {children}
      </button>
      {open && host && createPortal(
        <div ref={pop} className={s.personPop} role="dialog" aria-label={"Profile of " + name} onClick={(e) => e.stopPropagation()}
          style={{ "--pop-x": (at?.x ?? -9999) + "px", "--pop-y": (at?.y ?? -9999) + "px" } as React.CSSProperties} data-up={at?.up || undefined}>
          <PersonCard p={person} />
        </div>, host)}
    </>
  );
}
