"use client";
// TEAM MEMBER: what happened to what I sent. One card per problem or idea this person raised
// (or co-signed): where it is on the four steps, who has it, the date they owe an answer, what
// they said, and what it changed once it went live. Every sentence is built from the case by
// mineRow() / cosignRow() - nothing here is estimated or stored.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { askedForView, mineRows } from "@/components/dashboard/derive";
import { Pill, statusTone, type Tone } from "@/components/dashboard/shared/primitives";
import { roundState } from "@/features/cases/discussion";
import type { MineRow, MineStatus } from "@/features/cases/rows";
import styles from "./SentView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

// The four steps in the words an employee uses, not the system's.
const STEP_LABEL: Record<string, MessageKey> = { "Sent": "team.sentStepSent", "Read by a human": "team.sentStepRead", "Decided": "team.sentStepAnswered", "Shipped": "team.sentStepLive" };
// Status pill in plain words. Idea statuses (Awaiting decision, In trial, ...) already read fine.
const STATUS_LABEL: Partial<Record<MineStatus, MessageKey>> = {
  Sent: "team.sentStatusSent", Approved: "team.sentStatusApproved", Declined: "team.sentStatusDeclined", Building: "team.sentStatusBuilding", Shipped: "team.sentStatusShipped",
  "Question for you": "team.sentStatusQuestion", "Awaiting decision": "team.sentStatusAwaiting", "In trial": "team.sentStatusTrial", "In discussion": "team.sentStatusDiscussion",
  Planning: "team.sentStatusPlanning", "In progress": "team.sentStatusInProgress", Done: "team.sentStatusDone", Measured: "team.sentStatusMeasured", Recognised: "team.sentStatusRecognised", Stopped: "team.sentStatusStopped",
};
// The second half of the life: still moving is the accent, a result is green, the rest stays quiet.
const LIFE_TONE: Partial<Record<MineStatus, Tone>> = {
  "In discussion": "accent", Planning: "ok", "In progress": "ok", Done: "ok", Measured: "ink", Recognised: "ink", Stopped: "ghost",
};

// Still on someone's desk. Keyed objects, so the status names stay data and not text.
const WAITING: Partial<Record<MineStatus, true>> = { Sent: true, "Question for you": true, "Awaiting decision": true, "In discussion": true };
const TRIAL: Partial<Record<MineStatus, true>> = { "In trial": true };
const TALK: Partial<Record<MineStatus, true>> = { "In discussion": true };

export function SentView() {
  const t = useT();
  const ctx = useDemo();
  const label = (map: Partial<Record<string, MessageKey>>, k: string) => { const key = map[k]; return key ? t(key) : k; };
  const { seed, S, ready, href, openSheet, f } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;

  const P = seed.promiseDays;
  const mine = mineRows(ctx);
  const asked = askedForView(ctx);
  const waiting = mine.filter((m) => WAITING[m.status]).length;
  const live = mine.filter((m) => m.status === "Shipped").length;
  const answered = mine.length - waiting;
  const summary = [t("team.sentWaiting", { n: waiting }), t("team.sentAnswered", { n: answered }), t("team.sentLive", { n: live })].join(" · ");
  const changed = (m: MineRow) => m.status === "Shipped" || m.status === "Measured" || m.status === "Recognised"; // a result is in
  const hasOutcome = (m: MineRow) => changed(m) || m.status === "Building" || !!TRIAL[m.status];

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t("team.sentTitle")}</h1>
        <p className={styles.sub}>{mine.length ? summary : t("team.sentNothingSent")}</p>
      </div>

      {/* The promise, once, in one breath - this is the page every employee opens to check it is kept. */}
      <p className={styles.promise}>
        {t("team.sentPromise", { days: P })}
      </p>

      {/* Discussions someone invited this person into: their view is asked before a decision. */}
      {asked.length > 0 && (
        <section className={styles.asked} aria-label={t("team.sentAskedView")}>
          <h2 className={styles.askedTitle}>{t("team.sentAskedView")}</h2>
          {asked.map((c) => {
            const rs = roundState(c, S.rules, S.day);
            return (
              <Link key={c.id} href={href("/cases/" + c.id)} className={styles.askedRow}>
                <span className={styles.askedCase}>{c.title}</span>
                <span className={styles.askedMeta}>{t("team.sentAskedMeta", { who: c.discussion?.by ?? "", state: rs ? (rs.ready ? t("team.sentReadyToDecide") : t("team.sentRound", { round: rs.round, of: rs.of, date: f(rs.dueDay) })) : "" })}</span>
              </Link>
            );
          })}
        </section>
      )}

      {mine.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{t("team.sentEmptyTitle")}</div>
          <Link href={href("/raise")} className={styles.emptyLink}>{t("team.sentRaiseLink")}</Link>
        </div>
      )}

      <div className={styles.cards}>
        {mine.map((m) => (
          <article key={m.kind + m.id} className={styles.card} aria-label={m.title}>
            <div className={styles.top}>
              <div className={styles.titleBlock}>
                <h2 className={styles.caseTitle}>{m.title}</h2>
                <p className={styles.submitted}>{m.submitted}</p>
              </div>
              <Pill tone={LIFE_TONE[m.status] ?? statusTone(m.status)}>{label(STATUS_LABEL, m.status)}</Pill>
            </div>

            <ol className={styles.steps} aria-label={t("team.sentProgress")} data-long={m.steps.length > 4 ? "true" : undefined}>
              {m.steps.map((s) => (
                <li key={s.label} className={styles.step} data-tone={s.tone}>
                  <span className={styles.stepBar} />
                  <span className={styles.stepLabel}>{label(STEP_LABEL, s.label)}</span>
                  <span className={styles.stepWhen}>{s.when}</span>
                </li>
              ))}
            </ol>

            {/* Where it stands right now, in one sentence; then what the other side actually said. */}
            <p className={styles.now} data-overdue={m.overdue ? "true" : undefined}>{m.clock}</p>
            <div className={styles.reply}>
              <p className={styles.replyText}>{m.reply}</p>
              <p className={styles.replyBy}>{m.replyBy}</p>
            </div>

            {hasOutcome(m) && (
              <p className={styles.outcome}>
                <span className={styles.outcomeL}>{changed(m) ? t("team.sentWhatChanged") : t("team.sentWhatShouldChange")}</span>
                <strong className={styles.outcomeV}>{m.outcome}</strong>
                <span className={styles.outcomeNote}>{m.outcomeNote}</span>
              </p>
            )}

            <div className={styles.foot}>
              {m.canReply && <button type="button" className={styles.answer} onClick={() => openSheet("reply", m.id)}>{t("team.sentAnswer", { who: m.replyTo })}</button>}
              {!!TALK[m.status] && <Link href={href("/cases/" + m.id)} className={styles.more}>{t("team.sentRevise")}</Link>}
              {m.project && <Link href={href("/projects/" + m.project.id)} className={styles.more}>{m.project.label} {m.project.title} &rarr;</Link>}
              {m.kind === "case" && <Link href={href("/cases/" + m.id)} className={styles.more}>{t("team.sentHistory")}</Link>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
