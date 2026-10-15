"use client";
// The case page's half of the discussion stage and the archive (docs/plans/2026-10-15_idea-to-project.md
// sections 1-2): the line an archived idea carries, the discussion panel (who is in, the round, the
// check-ins), and the versions with the raiser's "Revise". CaseDetailView places them; every sentence
// is built here from the reduced case at render time.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { standingOn, versionsOf } from "@/components/dashboard/derive";
import { Avatar } from "@/components/dashboard/shared/primitives";
import { roundState, scoreVersions, versionReader } from "@/features/cases/discussion";
import type { ReducedCase } from "@/features/cases/reducer";
import { PROJECT_STATUS, raisedWith } from "@/features/cases/rows";
import { onDesk } from "@/features/cases/selectors";
import { GOALS } from "@/features/evaluate";
import { ideaContext } from "@/features/ideas/drafts";
import { projectLabel, projectOfCase } from "@/features/projects/selectors";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./CaseLoop.module.css";

// "Accepted on 14 Oct by T. Vogel → P-12 Shorter changeover · In progress" - or the no and its why.
export function ArchiveBanner({ c }: { c: ReducedCase }) {
  const { S, f, href } = useDemo();
  const dec = c.decided;
  if (!c.archived || !dec) return null;
  const p = dec.answer === "yes" ? projectOfCase(S, c) : undefined;
  const day = f(dec.day), when = day === "today" || day === "yesterday" ? day : "on " + day;
  return (
    <div className={styles.banner} data-tone={dec.answer === "yes" ? "yes" : "no"} role="note" aria-label="Archived">
      <span className={styles.bannerTag}>Archived</span>
      {dec.answer === "yes" ? (
        <span>
          Accepted {when} by {dec.by}
          {p ? <> → <Link href={href("/projects/" + p.id)} className={styles.bannerLink}>{projectLabel(p)} {p.title}</Link> · {PROJECT_STATUS[p.status]}</> : null}
        </span>
      ) : (
        <span>Declined {when} by {dec.by}{dec.reason ? " — " + dec.reason : ""}{dec.note ? ": “" + dec.note + "”" : ""}</span>
      )}
    </div>
  );
}

// Who is in, where the rounds stand, and every check-in with what it left open.
export function DiscussionPanel({ c }: { c: ReducedCase }) {
  const { S, f, role, persona, openSheet } = useDemo();
  const d = c.discussion;
  const rs = roundState(c, S.rules, S.day);
  if (!d || !rs) return null;
  const live = c.status === "discussion";
  const holder = live && (role === "manager" || onDesk(c, persona.who.name));
  const people = [c.from, ...d.invited];
  return (
    <section className={ui.card} aria-label="Discussion">
      <div className={styles.head}>
        <span className={ui.eyebrow}>Discussion</span>
        {live && (rs.ready
          ? <span className={styles.round}>Ready to decide</span>
          : <span className={styles.round} data-late={rs.late ? "true" : undefined}>Round {rs.round} of {rs.of} · {rs.late ? "check-in " + -rs.left + " d late" : "next check-in " + f(rs.dueDay)}</span>)}
      </div>
      {d.missing && <p className={styles.missing}><span className={styles.k}>Missing</span>{d.missing}</p>}
      <div className={styles.people}>
        {people.map((n, i) => (
          <span key={n} className={styles.who}><Avatar name={n} size="sm" />{n}{i === 0 && <span className={styles.whoNote}>raised it</span>}</span>
        ))}
      </div>
      <span className={ui.small}>Started by {d.by} {f(d.startedDay)}. A check-in every {S.rules.discussEveryDays} days, at most {rs.of} rounds.</span>
      {d.rounds.length > 0 && (
        <ol className={styles.checkins}>
          {d.rounds.map((r) => (
            <li key={r.round} className={styles.checkin}>
              <div className={styles.checkinHead}>
                <span className={styles.checkinTitle}>Check-in {r.round} · {r.next === "decide" ? "ready to decide" : "another round"}</span>
                <span className={ui.small}>{r.by} · {f(r.day)}</span>
              </div>
              {r.open.length > 0 && <div className={styles.open}>{r.open.map((o) => <span key={o} className={styles.openTag}>{o}</span>)}</div>}
              {r.note && <p className={styles.note}>{r.note}</p>}
            </li>
          ))}
        </ol>
      )}
      {holder && (
        <div className={styles.actions}>
          {!rs.ready && <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => openSheet("checkin", c.id)}>Check in</button>}
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => openSheet("invite", c.id)}>Invite more</button>
        </div>
      )}
    </section>
  );
}

// v1 → v2 → ... with the score of each and ▲ on the dials that got better. The raiser writes the next one.
export function VersionsPanel({ c, mine }: { c: ReducedCase; mine: boolean }) {
  const ctx = useDemo();
  const { act, f, showToast } = ctx;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [body, setBody] = useState(c.body);
  const versions = versionsOf(ctx, c);
  const canRevise = mine && !c.decided;
  if (versions.length < 2 && !canRevise) return null;
  const now = versions[versions.length - 1];
  // The draft scored live, against the version it would follow.
  const read = versionReader(ideaContext(ctx.seed.routes, GOALS, ctx.S.cases), c.id, { affected: standingOn(ctx, c), attachments: raisedWith(c).attachments });
  const draft = editing ? scoreVersions([now, { ...now, version: now.version + 1, title, body, overall: null }], read)[1] : null;
  const changed = body.trim() !== c.body.trim() || title.trim() !== c.title.trim();
  const post = () => {
    if (!draft || !changed || !body.trim()) return;
    act.revise(c.id, body.trim(), title.trim() !== c.title ? title.trim() : undefined, draft.score);
    setEditing(false);
    showToast("v" + draft.version + " posted · score " + now.score + " → " + draft.score + ". Everyone in the discussion sees it.");
  };
  const open = () => { setTitle(c.title); setBody(c.body); setEditing(true); };
  return (
    <section className={ui.card} aria-label="Versions">
      <div className={styles.head}>
        <span className={ui.eyebrow}>Versions</span>
        {canRevise && !editing && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={open}>Revise</button>}
      </div>
      <ol className={styles.versions}>
        {versions.map((v, i) => {
          const before = versions[i - 1];
          const delta = before ? v.score - before.score : 0;
          return (
            <li key={v.version} className={styles.version} data-now={i === versions.length - 1 ? "true" : undefined}>
              <span className={styles.vTag}>v{v.version}</span>
              <span className={styles.vBody}>
                <span className={styles.vTitle}>{v.title}</span>
                <span className={ui.small}>{v.by} · {f(v.day)}{v.up.length > 0 && <> · <span className={styles.up}>▲ {v.up.join(", ")}</span></>}</span>
              </span>
              <span className={styles.vScore}>
                {v.score}
                {before && delta !== 0 && <span className={styles.delta} data-down={delta < 0 ? "true" : undefined}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {versions.length > 1 && (
        <details className={styles.older}>
          <summary>Read the earlier versions</summary>
          {versions.slice(0, -1).map((v) => <div key={v.version} className={styles.oldText}><span className={styles.k}>v{v.version}</span>{v.body || "—"}</div>)}
        </details>
      )}
      {editing && draft && (
        <div className={styles.revise}>
          <label className={styles.k} htmlFor="revise-title">Title</label>
          <input id="revise-title" className={`nh-input ${styles.field}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className={styles.k} htmlFor="revise-body">The idea, v{draft.version}</label>
          <textarea id="revise-body" className={`nh-input nh-textarea ${styles.field}`} value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
          <div className={styles.dials}>
            {draft.dials.map((d) => {
              const was = now.dials.find((x) => x.key === d.key)?.value ?? d.value;
              return <span key={d.key} className={styles.dial} data-up={d.value > was ? "true" : undefined}>{d.label} {d.value}{d.value > was ? " ▲" : d.value < was ? " ▼" : ""}</span>;
            })}
          </div>
          <span className={ui.small}>Score {now.score} → {draft.score}. The benchmarks re-score every version; the older ones stay readable.</span>
          <div className={styles.actions}>
            <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={post} disabled={!changed || !body.trim()}>Post v{draft.version}</button>
            <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
