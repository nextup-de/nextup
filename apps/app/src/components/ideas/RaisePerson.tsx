"use client";
// A person on the raise page is a button: it opens the small profile the other pages show - the
// dashboard's card (team/DashboardView.tsx ProfilePop), at its sizes. The card is drawn over the page,
// fixed beside the button, so the sidebar or a dialog never clips it. Anyone not on the org chart (a
// handle, a free name) stays plain.
import Link from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { personFor, type Person } from "@/features/ideas/brief";
import { initials } from "@/features/ideas/raise";
import s from "./Raise.module.css";
import { avatarTone } from "@/lib/avatar";

export const RaisePeople = createContext<{ people: readonly OrgPerson[]; depts: readonly Dept[] }>({ people: [], depts: [] });

const W = 280, GAP = 8; // W: the widest the card gets (monitors); laptops draw it at 210

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
    const w = pop.current?.offsetWidth ?? W;
    setAt({ x: Math.max(GAP, Math.min(r.left, window.innerWidth - w - GAP)), y: up ? r.top - GAP - h : r.bottom + GAP, up });
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key, true); };
  }, [open]);

  if (!person) return <span className={className} data-avatar={avatarTone(name)}>{children}</span>;
  return (
    <>
      <button ref={btn} type="button" className={`${s.personBtn} ${className ?? ""}`} data-avatar={avatarTone(name)} aria-expanded={open} aria-label={label ?? "Profile of " + name} title={label ?? "Profile of " + name}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {children}
      </button>
      {open && host && createPortal(
        <div ref={pop} className={s.personPop} role="dialog" aria-label={"Profile of " + name} onClick={(e) => e.stopPropagation()}
          style={{ "--pop-x": (at?.x ?? -9999) + "px", "--pop-y": (at?.y ?? -9999) + "px" } as React.CSSProperties} data-up={at?.up || undefined}>
          <MiniProfile p={person} />
        </div>, host)}
    </>
  );
}

function MiniProfile({ p }: { p: Person }) {
  const { href, tenant } = useDemo();
  return (
    <>
      <div className={s.mpHead}>
        <span className={s.mpAv} data-avatar={avatarTone(p.name)} aria-hidden="true">{initials(p.name)}</span>
        <span className={s.mpWho}><span className={s.mpName}>{p.name}</span><span className={s.mpRole}>{p.role}</span></span>
      </div>
      <div className={s.mpGrid}>
        <span className={s.mpKey}>Department</span><span className={s.mpVal}>{p.dept || "—"}</span>
        <span className={s.mpKey}>Location</span><span className={s.mpVal}>{p.location || "—"}</span>
        <span className={s.mpKey}>Email</span><a className={s.mpMail} href={"mailto:" + p.email}>{p.email}</a>
      </div>
      {!tenant.hiddenPeople?.includes(p.name) && <Link className={s.mpBtn} href={href("/people/" + encodeURIComponent(p.name))}>
        View profile<svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 1l5 5-5 5" /></svg>
      </Link>}
    </>
  );
}
