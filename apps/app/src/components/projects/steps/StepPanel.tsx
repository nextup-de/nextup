"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { menuItems, statusOptions } from "@/features/projects/step-panel";
import type { ReducedProject } from "@/features/projects/types";
import { columnLabel, safeUrl, type JiraRow } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { teamOf, useRights, useSend, withIds } from "../parts";
import { MarkBlockedForm } from "./MarkBlockedForm";
import { Checklist } from "./panel/Checklist";
import { Comments } from "./panel/Comments";
import { HelpHistory } from "./panel/HelpHistory";
import { panelPeople } from "./panel/people";
import styles from "./panel/Panel.module.css";

export function StepPanel(props: {
  p: ReducedProject; stepId: string; jira: JiraRow; onClose: () => void; draftComment?: string;
}) {
  const { p, stepId } = props;
  const step = p.steps.find((s) => s.id === stepId);
  return step ? <Panel key={step.id} {...props} step={step} /> : null;
}

function Panel({ p, step, jira, onClose, draftComment }: Parameters<typeof StepPanel>[0] & { step: ReducedProject["steps"][number] }) {
  const ctx = useDemo();
  const { act, seed, f, S, showToast } = ctx;
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const team = withIds(teamOf(p, seed.seats));
  const people = panelPeople(ctx);
  const edit = rights.editStep(step);
  const canMove = rights.moveStep(step);
  const [title, setTitle] = useState(step.text);
  const [note, setNote] = useState(step.note);
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [inDays, setInDays] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  useEffect(() => {
    if (!statusOpen && !menuOpen) return;
    const dismiss = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-panel-menu="true"]')) { setStatusOpen(false); setMenuOpen(false); }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [statusOpen, menuOpen]);
  const change = (c: Parameters<typeof act.project.editStep>[2]) => send("project.step.edited", { stepId: step.id, ...c }, () => act.project.editStep(p.id, step.id, c));
  const move = (to: ReducedProject["steps"][number]["column"]) => send("project.step.moved", { stepId: step.id, to }, () => act.project.moveStep(p.id, step.id, to));
  const href = jira.state === "synced" && step.external?.system === "jira" ? safeUrl(step.external.url) : null;
  const waitingName = step.waitingOn?.kind === "person" ? people.find((x) => x.userId === step.waitingOn?.userId)?.name ?? step.waitingOn.name : step.waitingOn?.name;
  const menu = menuItems(p, step, jira, rights);
  return <>
  <button type="button" className={styles.scrim} onClick={onClose} aria-label={t("projects.closeStep")} tabIndex={-1} />
  <div ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-label={step.text} tabIndex={-1} onKeyDown={(e) => {
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (statusOpen || menuOpen) {
        panel.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
        setStatusOpen(false); setMenuOpen(false);
      } else if (blocked) setBlocked(false);
      else if (removing) setRemoving(false);
      else onClose();
    }
    if (e.key === "Tab") {
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
      const first = focusable?.[0], last = focusable?.[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <header className={styles.head}>
      {step.external?.key && <span className={styles.key}>{step.external.key}</span>}
      <span className={styles.project}>{p.title}</span>
      {href && <a className={styles.link} href={href} target="_blank" rel="noreferrer noopener">{t("projectSteps.openInJira")} ↗</a>}
      <div className={styles.anchor} data-panel-menu="true">
        <button type="button" className={styles.icon} aria-label={t("projectSteps.stepMenu")} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => { setMenuOpen(!menuOpen); setStatusOpen(false); }}>⋯</button>
        {menuOpen && <div className={styles.menu} role="menu" aria-label={t("projectSteps.stepMenu")}>
          {menu.map((item) => <button key={item} type="button" role="menuitem" onClick={() => {
            setMenuOpen(false);
            if (item === "remove") { setRemoving(true); return; }
            const url = new URL(window.location.href); url.searchParams.set("step", step.id);
            void navigator.clipboard.writeText(url.toString()).then(() => showToast(t("projectSteps.linkCopied"))).catch(() => showToast(t("common.retry")));
          }}>{t(item === "remove" ? "projectSteps.remove" : "projectSteps.copyLink")}</button>)}
        </div>}
      </div>
      <button type="button" className={styles.icon} onClick={onClose} aria-label={t("projectSteps.close")}>×</button>
    </header>
    <div className={styles.body}>
      {edit ? <textarea className={`nh-input ${styles.titleInput}`} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => {
        const text = title.trim(); if (text && text !== step.text) change({ text }); else if (!text) setTitle(step.text);
      }} aria-label={t("projectSteps.title")} maxLength={500} rows={2} /> : <h2 className={styles.title}>{step.text}</h2>}
      <div className={styles.fields}>
        <div className={styles.field}>
          <span className={styles.label}>{t("projectSteps.status")}</span>
          <div className={styles.anchor} data-panel-menu="true">
            <button type="button" className={styles.status} disabled={!canMove} aria-label={t("projectSteps.changeStatus")} aria-haspopup="menu" aria-expanded={statusOpen} onClick={() => { setStatusOpen(!statusOpen); setMenuOpen(false); }}>{columnLabel(step.column, locale)} ▾</button>
            {statusOpen && <div role="menu" aria-label={t("projectSteps.status")} className={styles.menu}>
              {statusOptions(p, step, jira).map((option) => <button key={option.column} type="button" role="menuitemradio" aria-checked={option.current} disabled={option.current} onClick={() => {
                setStatusOpen(false);
                if (option.requiresReason) setBlocked(true); else move(option.column);
              }}>{columnLabel(option.column, locale)}{option.requiresReason ? "…" : ""}</button>)}
              {jira.state === "synced" && <span className={styles.hint}>{t("projectSteps.jiraFollows")}</span>}
            </div>}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`panel-owner-${step.id}`}>{t("projectSteps.owner")}</label>
          {edit ? <select id={`panel-owner-${step.id}`} className="nh-input nh-select" value={step.ownerUserId ?? ""} onChange={(e) => {
            const person = team.find((x) => x.userId === e.target.value); change({ owner: person?.name ?? "", ownerUserId: person?.userId ?? null });
          }}><option value="">{t("projectSteps.noOwner")}</option>{team.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}</select> : <span>{step.owner || t("projectSteps.noOwner")}</span>}
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t("projectSteps.due")}</span>
          <div className={styles.section}>
            <span>{step.dueDay === null ? t("projectSteps.noDueDate") : f(step.dueDay)}</span>
            {edit && <div className={styles.row}>
              <button type="button" className={styles.link} onClick={() => change({ dueDay: S.day })}>{t("common.today")}</button>
              <button type="button" className={styles.link} onClick={() => change({ dueDay: S.day + 7 })}>{t("projects.quickWeek1")}</button>
              {step.dueDay !== null && <button type="button" className={styles.link} onClick={() => change({ dueDay: null })}>{t("projectSteps.clearDue")}</button>}
              <form onSubmit={(e) => { e.preventDefault(); const days = Number(inDays); if (inDays.trim() && Number.isInteger(days) && days >= 0 && days <= 365 && change({ dueDay: S.day + days })) setInDays(""); }}>
                <input className="nh-input" type="number" min={0} max={365} value={inDays} onChange={(e) => setInDays(e.target.value)} placeholder={t("projects.daysPlaceholder")} aria-label={t("projects.dueInHowMany")} />
              </form>
            </div>}
          </div>
        </div>
        {waitingName && <div className={styles.field}><span className={styles.label}>{t("projectSteps.waitingOn")}</span><span>{waitingName}</span></div>}
      </div>
      {step.column === "blocked" && step.why && <p className={styles.note}>{step.why}</p>}
      {blocked && <MarkBlockedForm p={p} step={step} onDone={() => setBlocked(false)} onCancel={() => setBlocked(false)} />}
      {(edit || step.note) && <section className={styles.section}>
        <label className={styles.label} htmlFor={`panel-note-${step.id}`}>{t("projectSteps.details")}</label>
        {edit ? <textarea id={`panel-note-${step.id}`} className="nh-input" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note.trim() !== step.note) change({ note: note.trim() }); }} maxLength={2000} placeholder={t("projectSteps.note")} rows={3} /> : <p id={`panel-note-${step.id}`} className={styles.note}>{step.note}</p>}
      </section>}
      <Checklist p={p} step={step} />
      <Comments p={p} step={step} draftComment={draftComment} />
      <HelpHistory p={p} step={step} />
      {removing && <div className={styles.section}>
        <span>{t("projectSteps.removeConfirm")}</span><div className={styles.row}>
          <button type="button" className="nh-btn" onClick={() => { if (change({ removed: true })) onClose(); }}>{t("projectSteps.remove")}</button>
          <button type="button" className={styles.link} onClick={() => setRemoving(false)}>{t("projectSteps.cancel")}</button>
        </div>
      </div>}
    </div>
    {canMove && <footer className={styles.foot}>
      <button type="button" className="nh-btn" onClick={() => setBlocked(true)}>{t("projectSteps.markBlocked")}</button>
      {step.column !== "done" && <button type="button" className="nh-btn nh-btn-primary" onClick={() => move("done")}>{t("projectSteps.markDone")}</button>}
    </footer>}
  </div></>;
}
