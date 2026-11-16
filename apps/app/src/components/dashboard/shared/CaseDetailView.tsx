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
import { useT } from "@/i18n/client";
import { translate, type MessageKey } from "@/i18n";
import { reasonTone, statusTone, type Tone } from "@/components/dashboard/shared/primitives";
import { DeptChip, PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import { AnswerPromise } from "@/components/cases/AnswerPromise";
import { CaseRelations } from "@/components/cases/CaseRelations";
import { CaseRouting } from "@/components/cases/CaseRouting";
import { useRelatedCase } from "@/components/cases/useRelatedCase";
import { seesRouting } from "@/features/cases/routing-trail";
import { ArchiveBanner, DiscussionPanel, VersionsPanel } from "@/components/dashboard/shared/CaseLoop";
import { ApprovalsBlock } from "@/components/cases/ApprovalsBlock";
import { ApproverLine } from "@/components/cases/ApproverLine";
import { CostField } from "@/components/cases/CostField";
import { ReviewBlock } from "@/components/cases/ReviewBlock";
import { roundState } from "@/features/cases/discussion";
import { timelineSentence, type TimelineFacts } from "@/features/cases/timeline";
import { stepLabel } from "@/features/approvals/steps";
import { approverName } from "@/features/approvals/approvers";
import { formatEuro } from "@/i18n/format";
import { isHandle } from "@/features/projects/views";
import { projectLabel, projectOfCase } from "@/features/projects/selectors";
import { isOpenDraft, mayReadDraft } from "@/features/projects/views";
import { isPrivateIdea } from "@/features/cases/visibility";
import { raisedWith } from "@/features/cases/rows";
import { affectedOn, commentsOn, rescoresOn } from "@/features/cases/selectors";
import { readableComment } from "@/features/cases/notice";
import { scoreBand, scoreCase } from "@/features/scoring";
import { loadShots } from "@/lib/shots";
import styles from "./CaseDetailView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const STATUS_LABEL = { open: "dashboard.statusSent", discussion: "dashboard.statusInDiscussion", asked: "dashboard.statusQuestion", decided: "dashboard.statusDecided", building: "dashboard.statusBuilding", shipped: "dashboard.statusShipped", withdrawn: "dashboard.statusWithdrawn", merged: "caseSee.statusMerged", approval: "approvals.waitsForApproval" } as const satisfies Record<string, MessageKey>;

// The status and reason chips in soft tints: a case that waits is amber, a result is green, the rest stays grey.
const CHIP_TONE: Record<Tone, "amber" | "green" | "grey"> = { accent: "amber", ink: "green", ok: "green", grey: "grey", soft: "grey", ghost: "grey", none: "grey", purple: "grey" };

/** `raiserInactive`: the server says the person who raised it by name has left (D20); false in the demo and without a database. */
/**
 * `embedded`: drawn under the idea card on the idea's one page (/idea?id=, Kevin 16 Nov 2026). The card already shows the
 * title, the text, who raised it, the desk, the versions and the chats, so they are left out here; what stays is what only
 * this view has: the approval line, the moves, the routing, cost and the history.
 */
export function CaseDetailView({ caseId, raiserInactive = false, embedded = false }: { caseId: string; raiserInactive?: boolean; embedded?: boolean }) {
  const ctx = useDemo();
  const related = useRelatedCase();
  const { S, log, href, ready, f, me, role, act, showToast, tenant, flag } = ctx;
  const router = useRouter();
  const t = useT();
  const [note, setNote] = useState("");
  const [big, setBig] = useState<number | null>(null); // index of the screenshot shown full size
  if (!ready) return embedded ? null : <PageSkeleton kind="detail" />;
  const c = S.cases.find((x) => x.id === caseId);
  // Someone else's case reads exactly like a missing one - the title is not leaked either way.
  if (!c || !canOpen(ctx, c)) {
    if (embedded) return null;
    return (
      <div className={styles.page}>
        <PageHeader title={t("dashboard.detailNoCase")} lede={t("dashboard.detailNoCaseSub", { id: caseId })} />
        <SectionCard name="no-case">
          <Link href={href("/")} className={`${styles.soft} ${styles.alone}`}>{t("dashboard.detailBackHome")}</Link>
        </SectionCard>
      </div>
    );
  }
  const P = ctx.seed.promiseDays;
  const extra = raisedWith(c);
  const shots = loadShots(tenant.slug, c.id); // whatever this browser kept when the case was raised
  const mine = me.userId !== null && c.fromUserId === me.userId;
  const affected = affectedOn(log, c.id), comments = commentsOn(log, c.id).map((m) => readableComment(m, t));
  const isMe = (userId: string | null | undefined) => me.userId !== null && userId === me.userId;
  const standing = [...extra.affected, ...affected.map((a) => a.name).filter((n) => !extra.affected.includes(n))];
  const reasons = affected.filter((a) => a.why); // leads say why it hits their team
  // The score as the dashboard scores it, re-evaluated with every piece of new information posted since.
  const updates = rescoresOn(log, c.id);
  const score = scoreCase({ ...c, affected: standing.length, evidence: extra.attachments, updates: updates.length }, ctx.seed.promiseDays, t);
  // Every desk it has been on, in order; the last one is where it is now.
  const chain = [c.handed.length ? c.handed[0].from : c.assignee, ...c.handed.map((h) => h.to)];
  if (c.escalated) chain.push(c.escalated.to);
  // Back: where the visitor came from when it was inside the app, otherwise the dashboard.
  const back = () => { if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back(); else router.push(href(flag("projects") ? "/inbox" : "/overview")); };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); showToast(t("dashboard.detailLinkCopied")); }
    catch { showToast(window.location.href); }
  };
  const sendNote = () => { const text = note.trim(); if (!text) return; act.comment(c.id, text); setNote(""); };
  const rs = roundState(c, S.rules, S.day);
  const clock = c.status === "asked" ? t("dashboard.detailClockPaused", { n: c.clock })
    : c.status === "discussion" && rs ? (rs.ready ? t("dashboard.evReadyToDecide") : t("dashboard.detailRound", { round: rs.round, of: rs.of, tail: rs.late ? t("dashboard.detailCheckinLate", { n: -rs.left }) : t("dashboard.detailCheckinOn", { date: f(rs.dueDay) }) }))
      : c.open ? (c.overdue ? t("dashboard.detailPastPromise", { n: c.clock - P }) : t("dashboard.detailLeftPromise", { n: P - c.clock })) : t("dashboard.detailAnsweredIn", { n: c.clock });
  // Archived and a project: read-only here, the conversation goes on at the project.
  const accepted = c.archived && flag("projects") ? projectOfCase(S, c) : undefined;
  // A draft is for the people on it, the holder of its escalated seat and (unless the idea is private) managers (SET D13): anyone else gets the
  // banner's "being set up" line and no link here, and no comment box either, since the conversation goes on at the draft.
  const hiddenDraft = accepted !== undefined && isOpenDraft(accepted)
    && !mayReadDraft(accepted, { role, userId: ctx.actorUserId }, S.cases.some((x) => accepted.sources.includes(x.id) && isPrivateIdea(x)));
  const project = hiddenDraft ? undefined : accepted;
  // What the timeline's sentences name beyond the event itself: another case's title, euros, and approvers by their role or council.
  // A named approver (decisions A to D) by their name.
  const approver: TimelineFacts["approver"] = (step) => (step.userId !== undefined ? approverName(S.seats, step.userId) : "") || stepLabel(step, S.approvals, S.approvals.roles).name;
  const facts: TimelineFacts = {
    labels: tenant.actorLabels,
    other: (id) => (id ? related.ofCase(id) : null),
    money: (eur) => formatEuro(ctx.locale, eur),
    approver,
    answeredStep: (runId, stepId) => {
      const step = [c.approvals, ...c.approvalRuns].find((r) => r !== null && r.runId === runId)?.steps.find((s) => s.id === stepId);
      return step ? approver(step) : "";
    },
  };
  const talk = flag("discussion");

  return (
    <>
    <div className={styles.page} data-embedded={embedded || undefined}>
    {!embedded && <button type="button" className={styles.back} onClick={back}>← {t("common.back")}</button>}
    {!embedded && <PageHeader
      title={c.title}
      lede={`${t(c.kind === "idea" ? "dashboard.detailIdea" : "dashboard.detailProblem")} · ${c.id}`}
      action={<button type="button" className={styles.soft} onClick={share}>{t("dashboard.detailCopyLink")}</button>}
    />}
    {flag("projects") && <ArchiveBanner c={c} />}
    <div className={styles.split}>
      <div className={styles.stack}>
      <SectionCard name="case">
        {/* A withdrawn idea promises no answer any more (decision Q1.14). */}
        {seesRouting(c, me, role) && !c.withdrawn && <AnswerPromise c={c} />}
        {/* Embedded, the card names the raiser; a raiser who has left is marked here (D20), as the quote did. */}
        {embedded && raiserInactive && !isHandle(c.from) && <div className={styles.quoteBy}><PersonFace name={c.from} size="sm" /> {c.from} <span className={styles.inactive} data-testid="raiser-inactive">({t("caseSee.inactive")})</span></div>}
        {!embedded && <div className={styles.meta}>
          <span className={styles.chip} data-tone={CHIP_TONE[statusTone(translate("en", STATUS_LABEL[c.status]))]}>{t(STATUS_LABEL[c.status])}</span>
          <span className={styles.chip} data-tone={CHIP_TONE[reasonTone(c.reason)]}>{c.reason}</span>
          <span className={styles.small}>{t("dashboard.detailRaised", { date: f(c.raisedDay), clock })}</span>
        </div>}
        {!embedded && <div className={styles.quote}>
          {c.body && <div className={styles.quoteText}>{c.body}</div>}
          <div className={styles.quoteBy}><PersonFace name={c.from} size="sm" /> {c.from}{raiserInactive && !isHandle(c.from) && <> <span className={styles.inactive} data-testid="raiser-inactive">({t("caseSee.inactive")})</span></>}{c.fromDept ? <> · <DeptChip name={c.fromDept} /></> : null}{extra.attachments > 0 && <> · {t("dashboard.detailScreenshots", { count: extra.attachments })}</>}</div>
          {shots.length > 0 && (
            <div className={styles.shots}>
              {shots.map((s, i) => (
                <button key={i} type="button" className={styles.shot} onClick={() => setBig(i)} aria-label={t("dashboard.detailOpenShot", { name: s.name })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
                  <img src={s.url} alt={s.name} />
                </button>
              ))}
            </div>
          )}
          {extra.attachments > 0 && shots.length === 0 && <div className={styles.shotsGone}>{t("dashboard.detailShotsGone")}</div>}
        </div>}
        <CaseRelations c={c} />
        {!embedded && <div className={styles.desks}>
          <span className={styles.label}>{t("dashboard.detailDesks")}</span>
          <span className={styles.chain}>
            {chain.map((name, i) => (
              <span key={i} className={styles.hop} data-last={i === chain.length - 1 ? "true" : undefined}>
                {i > 0 && <span className={styles.arrow} aria-hidden="true">→</span>}
                <PersonFace name={name} size="sm" />{name}
              </span>
            ))}
            {c.escalated && <span className={styles.auto}>{t("dashboard.detailAutoEscalated")}</span>}
          </span>
        </div>}
        {seesRouting(c, me, role) && <CaseRouting c={c} />}
        <ReviewBlock c={c} />
        <CostField c={c} />
        <ApproverLine c={c} />
        <ApprovalsBlock c={c} />
        {!embedded && <div className={styles.tiles}>
          <div className={styles.tile}><div className={styles.tileTitle}>{c.assignee}</div><div className={styles.tileL}>{t("dashboard.detailOnDesk")}{c.escalated ? " " + t("dashboard.detailAlso", { to: c.escalated.to }) : ""}</div></div>
          <div className={styles.tile}><div className={styles.tileTitle}>{c.route ? c.route.type : t("dashboard.detailNoRoute")}</div><div className={styles.tileL}>{c.route ? t("dashboard.detailDeputyBuddy", { deputy: c.route.deputy, buddy: c.route.buddy }) : t("dashboard.detailTriage")}</div></div>
          <div className={styles.tile}><div className={styles.tileTitle}>{c.upside || t("dashboard.detailNotEstimated")}</div><div className={styles.tileL}>{t("dashboard.detailCostWaiting")}</div></div>
          <div className={styles.tile}><div className={styles.tileTitle}>{c.shipped ? c.shipped.outcome : c.building?.expected ? t("dashboard.detailExpected", { x: c.building.expected }) : t("dashboard.detailPending")}</div><div className={styles.tileL}>{t("dashboard.detailOutcome")}</div></div>
        </div>}
      </SectionCard>
      {talk && <DiscussionPanel c={c} />}
      <VersionsPanel c={c} mine={mine} />
      </div>

      <div className={styles.stack}>
      {/* The moves are "Your move" beside the idea (components/cases/IdeaMove); this card keeps the score and who stands behind it. */}
      <SectionCard title={embedded ? undefined : t("dashboard.detailYourMove")} name="your-move">
        <div className={styles.score} title={score.parts.map((p) => "+" + p.points + " " + p.label).join("\n") || t("dashboard.detailBaseOnly")}>
          <span className={styles.scoreV} data-band={scoreBand(score.value)}>{score.value}</span>
          <span className={styles.scoreL}>{t("dashboard.detailScore", { parts: score.parts.length ? score.parts.map((p) => p.label.toLowerCase()).join(", ") : t("dashboard.detailBaseOnlyLc") })}</span>
        </div>
        {updates.map((u) => (
          <div key={u.id} className={styles.corr}>{t("dashboard.detailCorrected", { text: u.text, by: isMe(u.byUserId) ? t("dashboard.detailYou") : u.by, date: f(u.day) })}</div>
        ))}
        {standing.length > 0 && (
          <div className={styles.standing}>
            <span className={styles.avatars}>{standing.slice(0, 6).map((n) => <PersonFace key={n} name={n} size="sm" />)}</span>
            <span className={styles.small}>{t("dashboard.detailAffected", { count: standing.length, name: standing[0], by: mine ? t("dashboard.detailByYou") : c.from })}</span>
          </div>
        )}
        {reasons.map((a) => (
          <div key={a.name} className={styles.corr}>{t("dashboard.detailAsLead", { who: isMe(a.userId) ? t("dashboard.detailYouCap") : a.name, why: a.why ?? "", date: f(a.day) })}</div>
        ))}
        <div className={styles.thread}>
          {!embedded && comments.map((m) => (
            <div key={m.id} className={styles.comment}>
              <PersonFace name={m.by} size="sm" />
              <div className={styles.commentBody}>
                <div className={styles.commentText}>{m.text}</div>
                <div className={styles.commentBy}>{isMe(m.byUserId) ? t("dashboard.detailYou") : m.by} · {f(m.day)}{m.rescore && <span className={styles.rescoreTag}>{t("dashboard.detailNewInfoTag")}</span>}</div>
              </div>
            </div>
          ))}
          {project ? (
            <div className={styles.moved}>{t("dashboard.detailArchivedMoved")} <Link href={href("/projects/" + project.id)}>{projectLabel(project)} {project.title} →</Link></div>
          ) : hiddenDraft || embedded ? null : (
          <div className={styles.noteRow}>
            <input className={styles.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder={comments.length ? t("dashboard.detailAddThread") : t("dashboard.detailAddKnow")} aria-label={t("dashboard.detailComment")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendNote(); } }} />
            <button type="button" className={styles.soft} onClick={sendNote} disabled={!note.trim()}>{t("dashboard.detailPost")}</button>
          </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("dashboard.detailWhatHappened")} name="what-happened">
        <ol className={styles.timeline}>
          {c.history.map((e) => (
            <li key={e.id} className={styles.event}>
              <span className={styles.dot} data-seed={e.seed ? "true" : undefined} />
              <div className={styles.eventBody}>
                <div className={styles.eventText}>{timelineSentence(e, t, facts)}</div>
                <div className={styles.eventWhen}>{f(e.day)}</div>
              </div>
            </li>
          ))}
          {c.escalated && (
            <li className={styles.event}>
              <span className={styles.dot} data-tone="accent" />
              <div className={styles.eventBody}>
                <div className={styles.eventText}>{t("dashboard.detailPastPromiseEscalated", { n: P, to: c.escalated.to })}</div>
                <div className={styles.eventWhen}>{f(c.escalated.day)}</div>
              </div>
            </li>
          )}
        </ol>
        <div className={styles.small}>{t("dashboard.detailLogNote")}</div>
      </SectionCard>
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
          {shots.length > 1 && <button type="button" onClick={(e) => { e.stopPropagation(); setBig((big + 1) % shots.length); }}>{t("dashboard.detailNext")}</button>}
          <button type="button" onClick={() => setBig(null)}>{t("common.close")}</button>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
