"use client";
// One case, seen from three sides: its history as a timeline built from the event log.
// Open to whoever may see it in their lists or has it on their desk (derive.canOpen): an employee
// only their own, a lead their people's and their desk, a manager everything.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen } from "@/components/dashboard/derive";
import { Avatar, Empty, Pill, reasonTone, statusTone } from "@/components/dashboard/shared/primitives";
import type { CaseEvent } from "@/features/cases/events";
import { raisedWith } from "@/features/cases/rows";
import { affectedOn, commentsOn, rescoresOn } from "@/features/cases/selectors";
import { scoreBand, scoreCase } from "@/features/scoring";
import { loadShots } from "@/lib/shots";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./CaseDetailView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const STATUS_LABEL = { open: "Sent", asked: "Question for you", decided: "Decided", building: "Building", shipped: "Shipped" } as const;

// Facts in, one sentence out - nothing here is stored.
function sentence(e: CaseEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "case.raised": return e.actor + " raised this";
    case "case.read": return e.actor + " read it";
    case "case.decided": return e.actor + " answered “" + (p.answer ?? "yes") + "”" + (p.reason ? " — " + p.reason : "") + (p.note ? ": “" + p.note + "”" : "");
    case "case.handed": return e.actor + " handed it to " + p.to + (p.why ? " — “" + p.why + "”" : "");
    case "case.asked": return e.actor + " asked: “" + (p.text || "One question.") + "” · clock paused";
    case "case.answered": return e.actor + " answered: “" + p.text + "” · clock running again";
    case "case.building": return e.actor + " started the build" + (p.expected ? " — expected " + p.expected : "") + (p.days ? ", " + p.days + " days" : "");
    case "case.shipped": return e.actor + " shipped it — " + p.outcome + (p.outcomeNote ? " (" + p.outcomeNote + ")" : "");
    case "case.override": return e.actor + " overruled the proposed route";
    default: return e.actor + " · " + e.type;
  }
}

export function CaseDetailView({ caseId }: { caseId: string }) {
  const ctx = useDemo();
  const { S, log, href, ready, f, actor, persona, role, act, openSheet, showToast, tenant } = ctx;
  const router = useRouter();
  const [note, setNote] = useState("");
  const [why, setWhy] = useState(""); // the reason behind "affects my team too" / the new information behind a re-evaluation
  const [asking, setAsking] = useState(false); // the why field is open
  const [big, setBig] = useState<number | null>(null); // index of the screenshot shown full size
  if (!ready) return <PageSkeleton kind="detail" delay />;
  const c = S.cases.find((x) => x.id === caseId);
  // Someone else's case reads exactly like a missing one - the title is not leaked either way.
  if (!c || !canOpen(ctx, c)) {
    return (
      <div className={ui.card}>
        <Empty title="No such case" sub={"Nothing with the id “" + caseId + "” is in your view for this company."}>
          <Link href={href("/")} className={ui.ghost}>Back home</Link>
        </Empty>
      </div>
    );
  }
  const P = ctx.seed.promiseDays;
  const extra = raisedWith(c);
  const shots = loadShots(tenant.slug, c.id); // whatever this browser kept when the case was raised
  const who = persona.who;
  const mine = c.from === who.name || c.from === who.handle;
  const affected = affectedOn(log, c.id), comments = commentsOn(log, c.id);
  const meToo = affected.some((a) => a.name === actor);
  const standing = [...extra.affected, ...affected.map((a) => a.name).filter((n) => !extra.affected.includes(n))];
  const reasons = affected.filter((a) => a.why); // leads say why it hits their team
  // The score as the dashboard scores it, re-evaluated with every piece of new information posted since.
  const updates = rescoresOn(log, c.id);
  const score = scoreCase({ ...c, affected: standing.length, evidence: extra.attachments, updates: updates.length }, ctx.seed.promiseDays);
  // An employee re-evaluates the score with new information; a lead (or manager) stands behind it for their team, and says why.
  const lead = role !== "member";
  // Every desk it has been on, in order; the last one is where it is now.
  const chain = [c.handed.length ? c.handed[0].from : c.assignee, ...c.handed.map((h) => h.to)];
  if (c.escalated) chain.push(c.escalated.to);
  // Back: where the visitor came from when it was inside the app, otherwise the dashboard.
  const back = () => { if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back(); else router.push(href("/dashboard")); };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); showToast("Link copied — it opens for whoever may see this case."); }
    catch { showToast(window.location.href); }
  };
  const sendNote = () => { const t = note.trim(); if (!t) return; act.comment(c.id, t); setNote(""); };
  const sendWhy = () => {
    const t = why.trim(); if (!t) return;
    if (lead) { act.affect(c.id, t); showToast("Noted — your team is counted behind this " + c.kind + "."); }
    else { act.rescore(c.id, t); showToast("Score re-evaluated with the new information."); }
    setWhy(""); setAsking(false);
  };
  const clock = c.status === "asked" ? "clock paused at " + c.clock + " d"
    : c.open ? (c.overdue ? c.clock - P + " d past the promise" : P - c.clock + " d left on the promise") : "answered in " + c.clock + " d";

  return (
    <>
    <div className={styles.bar}>
      <button type="button" className={styles.back} onClick={back}>← Back</button>
      <button type="button" className={ui.textlink} onClick={share}>Copy link</button>
    </div>
    <div className={ui.split}>
      <div className={ui.card}>
        <div className={ui.eyebrow}>{c.kind === "idea" ? "Idea" : "Problem"} · {c.id}</div>
        <div className={ui.h2}>{c.title}</div>
        <div className={`${ui.chips} ${styles.meta}`}>
          <Pill tone={statusTone(STATUS_LABEL[c.status])}>{STATUS_LABEL[c.status]}</Pill>
          <Pill tone={reasonTone(c.reason)}>{c.reason}</Pill>
          <span className={ui.small}>raised {f(c.raisedDay)} · {clock}</span>
        </div>
        <div className={`${ui.quote} ${ui.mt14}`}>
          <div className={ui.quoteText}>{c.body || "—"}</div>
          <div className={ui.quoteBy}><Avatar name={c.from} size="sm" tone="color" /> {c.from} · {c.fromDept}{extra.attachments > 0 && <> · {extra.attachments} screenshot{extra.attachments > 1 ? "s" : ""} attached</>}</div>
          {shots.length > 0 && (
            <div className={styles.shots}>
              {shots.map((s, i) => (
                <button key={i} type="button" className={styles.shot} onClick={() => setBig(i)} aria-label={"Open " + s.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
                  <img src={s.url} alt={s.name} />
                </button>
              ))}
            </div>
          )}
          {extra.attachments > 0 && shots.length === 0 && <div className={styles.shotsGone}>The screenshots were kept in the browser that raised this case.</div>}
        </div>
        <div className={styles.desks}>
          <span className={ui.eyebrow}>Desks</span>
          <span className={styles.chain}>
            {chain.map((name, i) => (
              <span key={i} className={styles.hop} data-last={i === chain.length - 1 ? "true" : undefined}>
                {i > 0 && <span className={styles.arrow} aria-hidden="true">→</span>}
                <Avatar name={name} size="sm" tone="color" />{name}
              </span>
            ))}
            {c.escalated && <span className={styles.auto}>auto-escalated</span>}
          </span>
        </div>
        <div className={`${ui.grid2} ${ui.mt14}`}>
          <div className={ui.tile}><div className={ui.tileTitle}>{c.assignee}</div><div className={ui.tileL}>on whose desk it is{c.escalated ? " · also " + c.escalated.to : ""}</div></div>
          <div className={ui.tile}><div className={ui.tileTitle}>{c.route ? c.route.type : "no matching route"}</div><div className={ui.tileL}>{c.route ? "deputy " + c.route.deputy + " · buddy " + c.route.buddy : "a human triages it"}</div></div>
        </div>
        <div className={`${ui.grid2} ${ui.mt8}`}>
          <div className={ui.tile}><div className={ui.tileTitle}>{c.upside || "not estimated yet"}</div><div className={ui.tileL}>what it costs while it waits</div></div>
          <div className={ui.tile}><div className={ui.tileTitle}>{c.shipped ? c.shipped.outcome : c.building?.expected ? "expected " + c.building.expected : "pending"}</div><div className={ui.tileL}>outcome</div></div>
        </div>
      </div>

      <div className={ui.stack}>
      <div className={ui.card}>
        <div className={ui.eyebrow}>Your move</div>
        <div className={styles.score} title={score.parts.map((p) => "+" + p.points + " " + p.label).join("\n") || "Base score only"}>
          <span className={styles.scoreV} data-band={scoreBand(score.value)}>{score.value}</span>
          <span className={styles.scoreL}>score · {score.parts.length ? score.parts.map((p) => p.label.toLowerCase()).join(", ") : "base only"}</span>
        </div>
        {updates.map((u) => (
          <div key={u.id} className={styles.corr}>Corrected because of “{u.text}” · {u.by === actor ? "you" : u.by}, {f(u.day)}</div>
        ))}
        <div className={styles.actions}>
          {c.open && lead && (
            <button type="button" className={`nh-btn nh-btn-sm ${meToo ? "nh-btn-ghost" : "nh-btn-primary"}`} aria-pressed={meToo} aria-expanded={asking}
              onClick={() => { if (meToo) { act.affect(c.id); showToast("Withdrawn."); } else setAsking((v) => !v); }}>
              {meToo ? "✓ Affects my team too" : "Affects my team too"}
            </button>
          )}
          {c.open && !lead && (
            <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>Re-evaluate the score</button>
          )}
          {mine && c.status === "asked" && <button type="button" className="nh-btn nh-btn-accent nh-btn-sm" onClick={() => openSheet("reply", c.id)}>Answer the question</button>}
          {!c.open && <Link href={href("/raise")} className="nh-btn nh-btn-ghost nh-btn-sm">Raise a follow-up</Link>}
        </div>
        {asking && c.open && (
          <div className={styles.whyRow}>
            <input className={styles.note} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus aria-label={lead ? "Why it affects your team" : "What is new"}
              placeholder={lead ? "Because… what it does to your team" : "What is new — where, since when, what it costs now"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendWhy(); } if (e.key === "Escape") setAsking(false); }} />
            <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={sendWhy} disabled={!why.trim()}>{lead ? "Confirm" : "Re-evaluate"}</button>
          </div>
        )}
        {standing.length > 0 && (
          <div className={styles.standing}>
            <span className={styles.avatars}>{standing.slice(0, 6).map((n) => <Avatar key={n} name={n} size="sm" tone="color" />)}</span>
            <span className={ui.small}>{standing.length === 1 ? standing[0] + " is" : standing.length + " people are"} affected too · raised by {mine ? "you" : c.from}</span>
          </div>
        )}
        {reasons.map((a) => (
          <div key={a.name} className={styles.corr}>{a.name === actor ? "You" : a.name}, as the lead: “{a.why}” · {f(a.day)}</div>
        ))}
        <div className={styles.thread}>
          {comments.map((m) => (
            <div key={m.id} className={styles.comment}>
              <Avatar name={m.by} size="sm" tone="color" />
              <div className={ui.rowBody}>
                <div className={styles.commentText}>{m.text}</div>
                <div className={styles.commentBy}>{m.by === actor ? "you" : m.by} · {f(m.day)}{m.rescore && <span className={styles.rescoreTag}>new information · score re-evaluated</span>}</div>
              </div>
            </div>
          ))}
          <div className={styles.noteRow}>
            <input className={styles.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder={comments.length ? "Add to the thread" : "Add what you know — where, since when, what it costs"} aria-label="Comment"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendNote(); } }} />
            <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={sendNote} disabled={!note.trim()}>Post</button>
          </div>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.eyebrow}>What happened</div>
        <ol className={styles.timeline}>
          {c.history.map((e) => (
            <li key={e.id} className={styles.event}>
              <span className={styles.dot} data-seed={e.seed ? "true" : undefined} />
              <div className={styles.eventBody}>
                <div className={styles.eventText}>{sentence(e)}</div>
                <div className={styles.eventWhen}>{f(e.day)}</div>
              </div>
            </li>
          ))}
          {c.escalated && (
            <li className={styles.event}>
              <span className={styles.dot} data-tone="accent" />
              <div className={styles.eventBody}>
                <div className={styles.eventText}>Past the {P}-day promise — the map moved it sideways to {c.escalated.to} as well</div>
                <div className={styles.eventWhen}>{f(c.escalated.day)}</div>
              </div>
            </li>
          )}
        </ol>
        <div className={`${ui.note} ${ui.mt}`}>Every line is one event in the log. Nothing on this page is stored as text — it is built from who did what on which day.</div>
      </div>
      </div>
    </div>
    {big !== null && shots[big] && createPortal(
      <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={shots[big].name} onClick={() => setBig(null)}
        onKeyDown={(e) => { if (e.key === "Escape") setBig(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
        <img src={shots[big].url} alt={shots[big].name} onClick={(e) => e.stopPropagation()} />
        <div className={styles.lightboxBar}>
          <span>{shots[big].name} · {big + 1}/{shots.length}</span>
          {shots.length > 1 && <button type="button" onClick={(e) => { e.stopPropagation(); setBig((big + 1) % shots.length); }}>Next →</button>}
          <button type="button" onClick={() => setBig(null)}>Close</button>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
