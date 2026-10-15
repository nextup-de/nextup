"use client";
// Beside the board: who works on it (add, remove, hand over the lead), links (a URL, a Jira key),
// what was said, and the timeline of everything that happened to the project.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar } from "@/components/dashboard/shared/primitives";
import { projectCommentsOn } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { safeUrl, systemOf, timelineOf } from "@/features/projects/views";
import { useRights, useSend } from "./parts";
import styles from "./Projects.module.css";

export function TeamPanel({ p }: { p: ReducedProject }) {
  const { act, seed } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [add, setAdd] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const live = p.status !== "stopped" && p.status !== "recognised";
  const team = [p.lead, ...p.members];
  const others = seed.people.map((x) => x.name).filter((n) => !team.includes(n));

  return (
    <section className={styles.panel} aria-labelledby={"team-" + p.id}>
      <h2 id={"team-" + p.id} className={styles.h2}>Team</h2>
      <ul className={styles.people}>
        <li className={styles.person}><Avatar name={p.lead} size="sm" /><span className={styles.grow}>{p.lead}</span><span className={styles.muted}>Lead</span></li>
        {p.members.map((m) => (
          <li key={m} className={styles.person}>
            <Avatar name={m} size="sm" /><span className={styles.grow}>{m}</span>
            {r.lead && live && <button type="button" className={styles.quiet} onClick={() => send("project.member", { name: m }, () => act.project.member(p.id, m, false))} aria-label={"Take " + m + " off the team"}>Remove</button>}
          </li>
        ))}
      </ul>
      {r.lead && live && others.length > 0 && (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); if (add && send("project.member", { name: add }, () => act.project.member(p.id, add, true))) setAdd(""); }}>
          <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add to the team">
            <option value="">Add someone…</option>
            {others.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!add}>Add</button>
        </form>
      )}
      {r.hand && p.members.length > 0 && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (to && send("project.handed", { to }, () => act.project.hand(p.id, to, why.trim() || undefined))) { setTo(""); setWhy(""); } }} aria-label="Hand over the lead">
          <select className={`nh-input nh-select ${styles.input}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="New lead">
            <option value="">Hand the lead to…</option>
            {p.members.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {to && <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why (optional)" aria-label="Why hand it over" />}
          {to && <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm">Hand over the lead</button></span>}
        </form>
      )}
    </section>
  );
}

export function LinksPanel({ p }: { p: ReducedProject }) {
  const { act, f } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [stepId, setStepId] = useState("");
  if (!p.links.length && !r.link) return null;
  const stepText = (id: string | null) => (id ? p.steps.find((s) => s.id === id)?.text : undefined);
  const badUrl = url.trim() !== "" && !safeUrl(url);

  return (
    <section className={styles.panel} aria-labelledby={"links-" + p.id}>
      <h2 id={"links-" + p.id} className={styles.h2}>Links</h2>
      {p.links.length === 0 && <p className={styles.emptyLine}>No links yet. Add the ticket or the folder the work lives in.</p>}
      <ul className={styles.links}>
        {p.links.map((l, k) => {
          const href = safeUrl(l.url);
          const name = l.key || l.url;
          return (
            <li key={k} className={styles.linkRow}>
              {href ? <a href={href} target="_blank" rel="noreferrer noopener" className={styles.link}>{name}</a> : <span>{name}</span>}
              <span className={styles.muted}>{(stepText(l.stepId) ? "on “" + stepText(l.stepId) + "” · " : "") + f(l.day)}</span>
            </li>
          );
        })}
      </ul>
      {r.link && (
        <form className={styles.form} aria-label="Add a link" onSubmit={(e) => {
          e.preventDefault();
          if (badUrl) return;
          const k = key.trim();
          if (send("project.linked", { url: url.trim(), key: k }, () => act.project.link(p.id, url.trim(), k ? systemOf(k) : "url", k || undefined, stepId || undefined))) { setUrl(""); setKey(""); setStepId(""); }
        }}>
          <input className={`nh-input ${styles.input}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link address" aria-invalid={badUrl ? "true" : undefined} />
          {badUrl && <span className="nh-error">Only http and https addresses.</span>}
          <span className={styles.inline}>
            <input className={`nh-input ${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key, e.g. FS-12 (optional)" aria-label="Ticket key" />
            {p.steps.length > 0 && (
              <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="For which step">
                <option value="">The whole project</option>
                {p.steps.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
              </select>
            )}
          </span>
          <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={(!url.trim() && !key.trim()) || badUrl}>Add the link</button></span>
        </form>
      )}
    </section>
  );
}

export function CommentsPanel({ p }: { p: ReducedProject }) {
  const { act, log, f } = useDemo();
  const send = useSend(p);
  const [text, setText] = useState("");
  const comments = projectCommentsOn(log, p.id).concat(
    // Seed comments live in the project's history, not in this browser's log.
    p.history.filter((e) => e.seed && e.type === "project.commented").map((e) => ({ id: e.id, by: e.actor, text: e.payload.text ?? "", day: e.day })),
  ).sort((a, b) => a.day - b.day);

  return (
    <section className={styles.panel} aria-labelledby={"comments-" + p.id}>
      <h2 id={"comments-" + p.id} className={styles.h2}>Comments</h2>
      {comments.length === 0 && <p className={styles.emptyLine}>Nothing said yet.</p>}
      <ul className={styles.comments}>
        {comments.map((c) => (
          <li key={c.id} className={styles.comment}>
            <span className={styles.commentBy}>{c.by} · {f(c.day)}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (send("project.commented", { text }, () => act.project.comment(p.id, text.trim()))) setText(""); }}>
        <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something to the team" aria-label="Comment" maxLength={2000} />
        <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!text.trim()}>Comment</button></span>
      </form>
    </section>
  );
}

export function TimelinePanel({ p }: { p: ReducedProject }) {
  const { f } = useDemo();
  const lines = timelineOf(p);
  return (
    <section className={styles.panel} aria-labelledby={"timeline-" + p.id}>
      <h2 id={"timeline-" + p.id} className={styles.h2}>Timeline</h2>
      <ol className={styles.timeline}>
        {lines.map((l) => (
          <li key={l.id} className={styles.tl}>
            <span className={styles.tlDay}>{f(l.day)}</span>
            <span><span className={styles.strong}>{l.by}</span> {l.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
