"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { askDraft, milestoneCards, validMilestone, type MilestoneCard, type MilestoneIssue } from "@/features/projects/milestones-view";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { useRights, useSend } from "../../parts";
import { StepPanel } from "../../steps/StepPanel";
import type { ToolProps } from "../../tools/types";
import { useDayMap } from "../calendar/days";
import styles from "./Milestones.module.css";


export function Milestones({ p, jira }: ToolProps) {
  const { act, S, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"open" | "shipped" | null>(null);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ stepId: string; draft?: string } | null>(null);
  const cards = milestoneCards(p, S.day);
  const needle = query.trim().toLowerCase();
  const shown = cards.filter((card) => (!needle || card.milestone.title.toLowerCase().includes(needle)) && (only === null || (only === "shipped") === (card.state === "shipped")));
  const openCount = cards.filter((card) => card.state !== "shipped").length;
  const editor = rights.addStep;

  const ship = (card: MilestoneCard) => {
    setMenu(null);
    send("project.milestone.edited", { milestoneId: card.milestone.id, shipped: card.state !== "shipped" }, () => act.project.milestone.edit(p.id, card.milestone.id, { shipped: card.state !== "shipped" }));
  };
  const assign = (stepId: string, milestoneId: string) => send("project.step.edited", { stepId, milestoneId }, () => act.project.editStep(p.id, stepId, { milestoneId }));

  return <section className={styles.milestones} aria-label={t("projectMilestones.label")}>
    <div className={styles.toolbar}>
      <input className="nh-input" type="search" aria-label={t("projectMilestones.search")} placeholder={t("projectMilestones.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="button" className={styles.control} aria-pressed={only === "open"} onClick={() => setOnly(only === "open" ? null : "open")}>{t("projectMilestones.notShipped")}<span className={styles.count}>{openCount}</span></button>
      <button type="button" className={styles.control} aria-pressed={only === "shipped"} onClick={() => setOnly(only === "shipped" ? null : "shipped")}>{t("projectMilestones.shipped")}</button>
      <span className={styles.spacer} />
      {editor && <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setCreating(true)}>+ {t("projectMilestones.create")}</button>}
    </div>
    {cards.length === 0 && <p className={styles.empty}>{t("projectMilestones.empty")}</p>}
    {cards.length > 0 && shown.length === 0 && <p className={styles.empty}>{t("projectMilestones.emptyFilter")}</p>}
    {shown.map((card) => {
      const m = card.milestone;
      const done = card.progress.done;
      return <article key={m.id} className={styles.card} data-state={card.state} aria-label={m.title}>
        <header className={styles.head}>
          <h3>{m.title}</h3>
          <span className={styles.state} data-state={card.state}>{t(`projectMilestones.state${card.state[0].toUpperCase()}${card.state.slice(1)}` as MessageKey)}</span>
          <span className={styles.spacer} />
          <PersonFace name={p.lead} size="sm" />
          {editor && <span className={styles.menuWrap}>
            <button type="button" className={styles.more} aria-label={t("projectMilestones.menu", { title: m.title })} aria-haspopup="menu" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>⋯</button>
            {menu === m.id && <div role="menu" className={styles.menu} onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }}>
              <button type="button" role="menuitem" autoFocus onClick={() => ship(card)}>{t(card.state === "shipped" ? "projectMilestones.reopen" : "projectMilestones.markShipped")}</button>
            </div>}
          </span>}
        </header>
        <p className={styles.line}>
          {m.startDay !== null ? t("projectMilestones.dates", { start: f(m.startDay), due: f(m.dueDay) }) : t("projectMilestones.datesNoStart", { due: f(m.dueDay) })}
          {card.state !== "shipped" && <> · {card.daysLeft >= 0 ? t("projectMilestones.daysLeft", { count: card.daysLeft }) : t("projectMilestones.daysLate", { count: -card.daysLeft })}</>}
        </p>
        {card.progress.total > 0 ? <>
          <div className={styles.bar} role="img" aria-label={t("projectMilestones.progress", { done, total: card.progress.total })}>
            {(["done", "doing", "blocked", "todo"] as const).map((col) => card.progress[col] > 0 && <span key={col} data-column={col} style={{ flexGrow: card.progress[col] }} />)}
          </div>
          <p className={styles.hint}>{t("projectMilestones.progress", { done, total: card.progress.total })}</p>
          <ul className={styles.steps}>{card.steps.map((step) => <li key={step.id}>
            <button type="button" className={styles.step} onClick={() => setPanel({ stepId: step.id })}>{step.text}</button>
            <span className={styles.stepState} data-column={step.column}>{columnLabel(step.column, locale)}</span>
          </li>)}</ul>
        </> : <p className={styles.hint}>{t("projectMilestones.noSteps")}{editor && <> · <button type="button" className={styles.link} aria-expanded={picker === m.id} onClick={() => setPicker(picker === m.id ? null : m.id)}>{t("projectMilestones.addSteps")}</button></>}</p>}
        {picker === m.id && <div className={styles.picker} role="group" aria-label={t("projectMilestones.pickerLabel")}>
          {p.steps.filter((s) => !s.dropped && !s.milestoneId).map((s) => <div key={s.id} className={styles.pickRow}><span>{s.text}</span><button type="button" className={styles.control} onClick={() => assign(s.id, m.id)}>{t("projectMilestones.pickerAdd")}</button></div>)}
          {p.steps.every((s) => s.dropped || s.milestoneId) && <p className={styles.hint}>{t("projectMilestones.pickerEmpty")}</p>}
          <button type="button" className={styles.control} onClick={() => setPicker(null)}>{t("projectMilestones.pickerClose")}</button>
        </div>}
        {card.state !== "shipped" && <p className={styles.estimate} data-risk={(card.estimate.kind === "some" && card.estimate.lateDays > 0) || undefined}>
          {card.estimate.kind === "none" ? t("projectMilestones.estimateNone") : card.estimate.lateDays > 0 ? t("projectMilestones.estimateLate", { count: card.estimate.lateDays }) : t("projectMilestones.estimateOnTime")}
          <span className={styles.info} role="img" tabIndex={0} aria-label={`${t("projectMilestones.estimateInfoLabel")}: ${t("projectMilestones.estimateInfo")}`} title={t("projectMilestones.estimateInfo")}>ⓘ</span>
          {card.ask && <button type="button" className={styles.link} onClick={() => setPanel({ stepId: card.ask!.step.id, draft: askDraft(card.ask!.step, { name: card.ask!.name }, t("projectMilestones.askIntro")).text })}>{t("projectMilestones.ask", { name: card.ask.name })}</button>}
        </p>}
      </article>;
    })}
    {creating && <CreateDialog onClose={() => setCreating(false)} onCreate={(input) => send("project.milestone.added", { milestoneId: "probe", ...input }, () => act.project.milestone.add(p.id, input))} />}
    {panel && <StepPanel p={p} stepId={panel.stepId} jira={jira} draftComment={panel.draft} onClose={() => setPanel(null)} />}
  </section>;
}

function CreateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { title: string; startDay?: number | null; dueDay: number; note?: string }) => unknown }) {
  const t = useT();
  const map = useDayMap();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<MilestoneIssue | "badDay" | null>(null);
  const submit = () => {
    const dueDay = due ? map.dayOf(due) : null;
    const startDay = start ? map.dayOf(start) : null;
    if ((due && dueDay === null) || (start && startDay === null)) { setIssue("badDay"); return; }
    const input = { title: title.trim(), ...(start ? { startDay } : {}), dueDay: dueDay as number, ...(note.trim() ? { note: note.trim() } : {}) };
    const problem = validMilestone({ ...input, dueDay: dueDay ?? undefined });
    if (problem) { setIssue(problem); return; }
    if (onCreate(input)) onClose();
  };
  return <div className={styles.scrim}>
    <form className={styles.dialog} role="dialog" aria-modal="true" aria-label={t("projectMilestones.dialogTitle")} onSubmit={(e) => { e.preventDefault(); submit(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <h2>{t("projectMilestones.dialogTitle")}</h2>
      <label>{t("projectMilestones.name")}<input className="nh-input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className={styles.dates}>
        <label>{t("projectMilestones.starts")}<input className="nh-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>{t("projectMilestones.ships")}<input className="nh-input" type="date" required value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <label>{t("projectMilestones.description")}<textarea className="nh-input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {issue && <p role="alert" className={styles.error}>{issue === "title" ? t("projectMilestones.issueTitle") : issue === "note" ? t("projectMilestones.issueNote") : issue === "due" ? t("projectMilestones.issueDue") : issue === "dates" ? t("projectMilestones.issueDates") : t("projectMilestones.badDay")}</p>}
      <div className={styles.actions}>
        <button type="button" className="nh-btn" onClick={onClose}>{t("projectMilestones.cancel")}</button>
        <button type="submit" className="nh-btn nh-btn-primary" disabled={!title.trim()}>{t("projectMilestones.create")}</button>
      </div>
    </form>
  </div>;
}
