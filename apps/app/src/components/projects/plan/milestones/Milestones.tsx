"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { askDraft, milestoneCards, MILESTONE_KEYS, validMilestone, type MilestoneCard, type MilestoneIssue, type MilestonesKey } from "@/features/projects/milestones-view";
import { stepKey } from "@/features/projects/list-view";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useRights, useSend } from "../../parts";
import { StepPanel } from "../../steps/StepPanel";
import type { ToolProps } from "../../tools/types";
import { useDayMap } from "../calendar/days";
import styles from "./Milestones.module.css";


export function Milestones({ p, jira }: ToolProps) {
  const { act, S, f } = useDemo();
  const locale = useLocale();
  const t = useT();
  const tx = (key: MilestonesKey, params?: Record<string, string | number>) => t(MILESTONE_KEYS[key], params);
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

  return <section className={styles.milestones} aria-label={tx("label")}>
    <div className={styles.toolbar}>
      <input className="nh-input" type="search" aria-label={tx("search")} placeholder={tx("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="button" className={styles.control} aria-pressed={only === "open"} onClick={() => setOnly(only === "open" ? null : "open")}>{tx("notShipped")}<span className={styles.count}>{openCount}</span></button>
      <button type="button" className={styles.control} aria-pressed={only === "shipped"} onClick={() => setOnly(only === "shipped" ? null : "shipped")}>{tx("shipped")}</button>
      <span className={styles.spacer} />
      {editor && <button type="button" className="nh-btn nh-btn-secondary nh-btn-sm" onClick={() => setCreating(true)}>+ {tx("create")}</button>}
    </div>
    {cards.length === 0 && <p className={styles.empty}>{tx("empty")}</p>}
    {cards.length > 0 && shown.length === 0 && <p className={styles.empty}>{tx("emptyFilter")}</p>}
    {shown.map((card) => {
      const m = card.milestone;
      const done = card.progress.done;
      return <article key={m.id} className={styles.card} data-state={card.state} aria-label={m.title}>
        <header className={styles.head}>
          <h3>{m.title}</h3>
          <span className={styles.state} data-state={card.state}>{tx(`state${card.state[0].toUpperCase()}${card.state.slice(1)}` as MilestonesKey)}</span>
          <span className={styles.spacer} />
          <PersonFace name={p.lead} size="sm" />
          {editor && <span className={styles.menuWrap}>
            <button type="button" className={styles.more} aria-label={tx("menu", { title: m.title })} aria-haspopup="menu" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>⋯</button>
            {menu === m.id && <div role="menu" className={styles.menu} onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }}>
              <button type="button" role="menuitem" autoFocus onClick={() => ship(card)}>{tx(card.state === "shipped" ? "reopen" : "markShipped")}</button>
            </div>}
          </span>}
        </header>
        <p className={styles.line}>
          <span>{m.startDay !== null ? tx("startsShips", { start: f(m.startDay) }) : tx("shipsLead")}</span>
          <span className={styles.pill}>{f(m.dueDay)}{card.state !== "shipped" && <> · {card.daysLeft >= 0 ? tx("daysLeft", { count: card.daysLeft }) : tx("daysLate", { count: -card.daysLeft })}</>}</span>
        </p>
        {card.progress.total > 0 ? <>
          <div className={styles.progressRow}>
            <div className={styles.bar} role="img" aria-label={tx("progress", { done, total: card.progress.total })}>
              {card.steps.map((step) => <span key={step.id} data-column={step.column} />)}
            </div>
            <span className={styles.hint}>{tx("progress", { done, total: card.progress.total })}</span>
          </div>
          <ul className={styles.steps}>{card.steps.map((step) => <li key={step.id}>
            <span className={styles.key}>{stepKey(step)}</span>
            <button type="button" className={styles.step} onClick={() => setPanel({ stepId: step.id })}>{step.text}</button>
            <span className={styles.stepState} data-column={step.column}>{columnLabel(step.column, locale)}</span>
          </li>)}</ul>
        </> : <p className={styles.hint}>{tx("noSteps")}{editor && <> · <button type="button" className={styles.link} aria-expanded={picker === m.id} onClick={() => setPicker(picker === m.id ? null : m.id)}>{tx("addSteps")}</button></>}</p>}
        {picker === m.id && <div className={styles.picker} role="group" aria-label={tx("pickerLabel")}>
          {p.steps.filter((s) => !s.dropped && !s.milestoneId).map((s) => <div key={s.id} className={styles.pickRow}><span>{s.text}</span><button type="button" className={styles.control} onClick={() => assign(s.id, m.id)}>{tx("pickerAdd")}</button></div>)}
          {p.steps.every((s) => s.dropped || s.milestoneId) && <p className={styles.hint}>{tx("pickerEmpty")}</p>}
          <button type="button" className={styles.control} onClick={() => setPicker(null)}>{tx("pickerClose")}</button>
        </div>}
        {card.state !== "shipped" && <p className={styles.estimate} data-risk={(card.estimate.kind === "some" && card.estimate.lateDays > 0) || undefined}>
          {card.estimate.kind === "none" ? tx("estimateNone") : card.estimate.lateDays > 0 ? tx("estimateLate", { count: card.estimate.lateDays }) : tx("estimateOnTime")}
          <span className={styles.info} role="img" tabIndex={0} aria-label={`${tx("estimateInfoLabel")}: ${tx("estimateInfo")}`} title={tx("estimateInfo")}>ⓘ</span>
          {card.ask && <button type="button" className={styles.link} onClick={() => setPanel({ stepId: card.ask!.step.id, draft: askDraft(card.ask!.step, { name: card.ask!.name }, tx("askIntro")).text })}>{tx("ask", { name: card.ask.name })}</button>}
        </p>}
      </article>;
    })}
    {creating && <CreateDialog onClose={() => setCreating(false)} onCreate={(input) => send("project.milestone.added", { milestoneId: "probe", ...input }, () => act.project.milestone.add(p.id, input))} />}
    {panel && <StepPanel p={p} stepId={panel.stepId} jira={jira} draftComment={panel.draft} onClose={() => setPanel(null)} />}
  </section>;
}

function CreateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { title: string; startDay?: number | null; dueDay: number; note?: string }) => unknown }) {
  const t = useT();
  const tx = (key: MilestonesKey, params?: Record<string, string | number>) => t(MILESTONE_KEYS[key], params);
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
    <form className={styles.dialog} role="dialog" aria-modal="true" aria-label={tx("dialogTitle")} onSubmit={(e) => { e.preventDefault(); submit(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className={styles.dialogHead}><h2>{tx("dialogTitle")}</h2><button type="button" className={styles.more} aria-label={tx("cancel")} onClick={onClose}>×</button></div>
      <label>{tx("name")}<input className="nh-input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className={styles.dates}>
        <label>{tx("starts")}<input className="nh-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>{tx("ships")}<input className="nh-input" type="date" required value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <label>{tx("description")}<textarea className="nh-input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {issue && <p role="alert" className={styles.error}>{issue === "title" ? tx("issueTitle") : issue === "note" ? tx("issueNote") : issue === "due" ? tx("issueDue") : issue === "dates" ? tx("issueDates") : tx("badDay")}</p>}
      <div className={styles.actions}>
        <button type="button" className="nh-btn" onClick={onClose}>{tx("cancel")}</button>
        <button type="submit" className="nh-btn nh-btn-primary" disabled={!title.trim()}>{tx("create")}</button>
      </div>
    </form>
  </div>;
}
