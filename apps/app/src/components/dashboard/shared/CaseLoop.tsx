"use client";
// The case page's half of the discussion stage and the archive (docs/plans/2026-10-15_idea-to-project.md
// sections 1-2): the line an archived idea carries, the discussion panel (who is in, the round, the
// check-ins), and the versions with the raiser's "Revise". CaseDetailView places them; every sentence
// is built here from the reduced case at render time.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { standingOn, versionsOf } from "@/components/dashboard/derive";
import { useLocale, useT } from "@/i18n/client";
import { SecondLook } from "@/components/cases/SecondLook";
import { caseActions, questionOpen, reviseThenAnswer } from "@/features/cases/case-actions";
import { roundState, scoreVersions, versionReader } from "@/features/cases/discussion";
import { noCategoryLabel, noCategoryOf, noReasonOf } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { projectStatus, raisedWith } from "@/features/cases/rows";
import { onDeskOf } from "@/features/cases/selectors";
import { ideaContext } from "@/features/ideas/drafts";
import { projectLabel, projectOfCase } from "@/features/projects/selectors";
import { beingSetUpLine, isOpenDraft, mayReadDraft, raiserDraftPanel, type RaiserDraftPanel as RaiserDraftPanelData } from "@/features/projects/views";
import { isPrivateIdea } from "@/features/cases/visibility";
import { useCaseNames } from "@/components/cases/useCaseNames";
import { PersonFace, SectionCard } from "@/components/ui/elements";
import styles from "./CaseLoop.module.css";

// "Accepted on 14 Oct by T. Vogel → P-12 Shorter changeover · In progress" - or the no and its why.
// A draft the viewer may not read is "Accepted · being set up by {role}, start expected {date}" and no link (D13);
// one they may read is "Draft → P-12 title" (SET).
export function ArchiveBanner({ c }: { c: ReducedCase }) {
  const { S, f, href, role, actorUserId, seed, act } = useDemo();
  const t = useT();
  const locale = useLocale();
  const names = useCaseNames();
  const dec = c.decided;
  if (!c.archived || !dec) return null;
  const p = dec.answer === "yes" ? projectOfCase(S, c) : undefined;
  const rel = dec.day - S.day; // today and yesterday read as words, older days as a date
  const when = rel === 0 || rel === -1 ? f(dec.day) : t("dashboard.loopWhenOn", { day: f(dec.day) });
  const draft = p && isOpenDraft(p) ? p : undefined;
  const viewer = { role, userId: actorUserId };
  const hidden = draft !== undefined && !mayReadDraft(draft, viewer, S.cases.some((x) => draft.sources.includes(x.id) && isPrivateIdea(x)));
  const line = draft && hidden ? beingSetUpLine(draft, seed.seats, names.roleTitle) : null;
  const panel = draft ? raiserDraftPanel(draft, actorUserId, c.fromUserId) : null;
  return (
    <>
    <div className={styles.banner} data-tone={dec.answer === "yes" ? "yes" : "no"} role="note" aria-label={t("dashboard.loopArchived")}>
      <span className={styles.bannerTag}>{t("dashboard.loopArchived")}</span>
      {line && draft ? (
        <span data-testid="draft-being-set-up">{t("projectDraft.beingSetUp", { role: line.role || draft.lead, date: line.startDay === null ? t("loopCase.draftNoStart") : f(line.startDay) })}</span>
      ) : dec.answer === "yes" ? (
        <span>
          {draft ? t("projectDraft.title") : t("dashboard.loopAccepted", { when, by: dec.by })}
          {p ? <> → <Link href={href("/projects/" + p.id)} className={styles.bannerLink}>{projectLabel(p)} {p.title}</Link> · {projectStatus(p.status, locale)}</> : null}
        </span>
      ) : (
        <span data-testid="archived-no">{t("dashboard.loopDeclined", { when, by: dec.by })} — {t(noCategoryLabel(noCategoryOf(dec) ?? "other"))}{noReasonOf(dec) ? ": " + noReasonOf(dec) : ""}</span>
      )}
    </div>
    {dec.answer === "no" && <SecondLook c={c} />}
    {draft && panel?.show && <RaiserDraftPanel projectId={draft.id} panel={panel} comment={act.project.comment} />}
    </>
  );
}

// The raiser of the case, not on the draft (D20): what the lead wrote down of the goal, and one comment box.
function RaiserDraftPanel({ projectId, panel, comment }: { projectId: string; panel: RaiserDraftPanelData; comment: (projectId: string, text: string) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const rows = ([[t("loopCase.draftGoal"), panel.goal], [t("loopCase.draftDoneWhen"), panel.doneWhen], [t("loopCase.draftBrief"), panel.brief]] as [string, string | null][]).filter(([, v]) => v);
  return (
    <section aria-label={t("loopCase.draftPanel")} data-testid="draft-raiser-panel">
      {rows.map(([k, v]) => <p key={k} className={styles.missing}><span className={styles.k}>{k}</span>{v}</p>)}
      {panel.canComment && (
        <form onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (!v) return; comment(projectId, v); setText(""); }}>
          <label htmlFor={"draft-comment-" + projectId} className={styles.k}>{t("loopCase.draftComment")}</label>
          <textarea id={"draft-comment-" + projectId} className={`${styles.field} ${styles.area}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <button type="submit" className="nh-btn nh-btn-secondary nh-btn-sm" disabled={!text.trim()}>{t("loopCase.draftSend")}</button>
        </form>
      )}
    </section>
  );
}

// Who is in, where the rounds stand, and every check-in with what it left open.
export function DiscussionPanel({ c }: { c: ReducedCase }) {
  const { S, f, role, me, openSheet, act } = useDemo();
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const [leaveWhy, setLeaveWhy] = useState("");
  const d = c.discussion;
  const rs = roundState(c, S.rules, S.day);
  if (!d || !rs) return null;
  const live = c.status === "discussion";
  const holder = live && (role === "manager" || onDeskOf(c, me));
  const people = [c.from, ...d.invited];
  return (
    <section aria-label={t("dashboard.loopDiscussion")}>
    <SectionCard title={t("dashboard.loopDiscussion")} name="discussion" action={live ? (rs.ready
      ? <span className={styles.round}>{t("dashboard.loopReadyToDecide")}</span>
      : <span className={styles.round} data-late={rs.late ? "true" : undefined}>{t("dashboard.loopRound", { round: rs.round, of: rs.of, tail: rs.late ? t("dashboard.loopCheckinLate", { n: -rs.left }) : t("dashboard.loopNextCheckin", { date: f(rs.dueDay) }) })}</span>) : undefined}>
      {d.missing && <p className={styles.missing}><span className={styles.k}>{t("dashboard.loopMissing")}</span>{d.missing}</p>}
      <div className={styles.people}>
        {people.map((n, i) => (
          <span key={n} className={styles.who}><PersonFace name={n} size="sm" />{n}{i === 0 && <span className={styles.whoNote}>{t("dashboard.loopRaisedIt")}</span>}</span>
        ))}
      </div>
      <span className={styles.small}>{t("dashboard.loopStartedBy", { by: d.by, date: f(d.startedDay), n: S.rules.discussEveryDays, rounds: rs.of })}</span>
      {d.rounds.length > 0 && (
        <ol className={styles.checkins}>
          {d.rounds.map((r) => (
            <li key={r.round} className={styles.checkin}>
              <div className={styles.checkinHead}>
                <span className={styles.checkinTitle}>{t("dashboard.loopCheckinTitle", { round: r.round, next: r.next === "decide" ? t("dashboard.loopReadyLc") : t("dashboard.loopAnotherRound") })}</span>
                <span className={styles.small}>{r.by} · {f(r.day)}</span>
              </div>
              {r.open.length > 0 && <div className={styles.open}>{r.open.map((o) => <span key={o} className={styles.openTag}>{o}</span>)}</div>}
              {r.note && <p className={styles.note}>{r.note}</p>}
            </li>
          ))}
        </ol>
      )}
      {live && caseActions(c, me, role, S).declineInvite && (
        <div className={styles.actions}>
          {!leaving ? <button type="button" className={styles.soft} data-testid="discussion-not-for-me" onClick={() => setLeaving(true)}>{t("loopCase.notForMe")}</button> : (
            <>
              <input className={styles.field} value={leaveWhy} onChange={(e) => setLeaveWhy(e.target.value)} maxLength={300} aria-label={t("loopCase.notForMeWhy")} placeholder={t("loopCase.notForMeWhy")} autoFocus />
              <button type="button" className={styles.primary} data-testid="discussion-not-for-me-send" onClick={() => { act.declineInvite(c.id, leaveWhy.trim() || undefined); setLeaving(false); setLeaveWhy(""); }}>{t("loopCase.notForMeSend")}</button>
              <button type="button" className={styles.soft} onClick={() => setLeaving(false)}>{t("common.cancel")}</button>
            </>
          )}
        </div>
      )}
      {holder && (
        <div className={styles.actions}>
          {!rs.ready && <button type="button" className={styles.primary} onClick={() => openSheet("checkin", c.id)}>{t("dashboard.loopCheckIn")}</button>}
          <button type="button" className={styles.soft} onClick={() => openSheet("invite", c.id)}>{t("dashboard.loopInviteMore")}</button>
        </div>
      )}
    </SectionCard>
    </section>
  );
}

// v1 → v2 → ... with the score of each and ▲ on the dials that got better. The raiser writes the next one.
export function VersionsPanel({ c, mine }: { c: ReducedCase; mine: boolean }) {
  const ctx = useDemo();
  const { act, f, showToast } = ctx;
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [body, setBody] = useState(c.body);
  const versions = versionsOf(ctx, c);
  const canRevise = mine && !c.decided;
  if (versions.length < 2 && !canRevise) return null;
  const now = versions[versions.length - 1];
  // The draft scored live, against the version it would follow.
  const read = versionReader(ideaContext(ctx.seed.routes, ctx.seed.goals, ctx.S.cases, ctx.seed.spend), c.id, { affected: standingOn(ctx, c), attachments: raisedWith(c).attachments });
  const draft = editing ? scoreVersions([now, { ...now, version: now.version + 1, title, body, overall: null }], read)[1] : null;
  const changed = body.trim() !== c.body.trim() || title.trim() !== c.title.trim();
  const post = async () => {
    if (!draft || !changed || !body.trim()) return;
    // A new version while a question is open also answers it, once the revision went through (D20).
    const ok = await reviseThenAnswer(
      { revise: () => act.revise(c.id, body.trim(), title.trim() !== c.title ? title.trim() : undefined, draft.score), answer: (text) => act.answer(c.id, text) },
      draft.version, questionOpen(c),
    );
    if (!ok) return;
    setEditing(false);
    showToast(t("dashboard.loopPosted", { version: draft.version, from: now.score, to: draft.score }));
  };
  const open = () => { setTitle(c.title); setBody(c.body); setEditing(true); };
  return (
    <section aria-label={t("dashboard.loopVersions")}>
    <SectionCard title={t("dashboard.loopVersions")} name="versions" action={canRevise && !editing ? <button type="button" className={styles.soft} onClick={open}>{t("dashboard.loopRevise")}</button> : undefined}>
      <ol className={styles.versions}>
        {versions.map((v, i) => {
          const before = versions[i - 1];
          const delta = before ? v.score - before.score : 0;
          return (
            <li key={v.version} className={styles.version} data-now={i === versions.length - 1 ? "true" : undefined}>
              <span className={styles.vTag}>v{v.version}</span>
              <span className={styles.vBody}>
                <span className={styles.vTitle}>{v.title}</span>
                <span className={styles.small}>{v.by} · {f(v.day)}{v.up.length > 0 && <> · <span className={styles.up}>▲ {v.up.join(", ")}</span></>}</span>
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
          <summary>{t("dashboard.loopReadEarlier")}</summary>
          {versions.slice(0, -1).map((v) => <div key={v.version} className={styles.oldText}><span className={styles.k}>v{v.version}</span>{v.body}</div>)}
        </details>
      )}
      {editing && draft && (
        <div className={styles.revise}>
          <label className={styles.k} htmlFor="revise-title">{t("dashboard.loopTitle")}</label>
          <input id="revise-title" className={styles.field} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className={styles.k} htmlFor="revise-body">{t("dashboard.loopTheIdea", { version: draft.version })}</label>
          <textarea id="revise-body" className={`${styles.field} ${styles.area}`} value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
          <div className={styles.dials}>
            {draft.dials.map((d) => {
              const was = now.dials.find((x) => x.key === d.key)?.value ?? d.value;
              return <span key={d.key} className={styles.dial} data-up={d.value > was ? "true" : undefined}>{d.label} {d.value}{d.value > was ? " ▲" : d.value < was ? " ▼" : ""}</span>;
            })}
          </div>
          <span className={styles.small}>{t("dashboard.loopScoreLine", { from: now.score, to: draft.score })}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={post} disabled={!changed || !body.trim()}>{t("dashboard.loopPostV", { version: draft.version })}</button>
            <button type="button" className={styles.soft} onClick={() => setEditing(false)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </SectionCard>
    </section>
  );
}
