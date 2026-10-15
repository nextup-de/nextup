"use client";
// TEAM MEMBER: what happened to what I sent. One card per problem or idea this person raised
// (or co-signed): where it is on the four steps, who has it, the date they owe an answer, what
// they said, and what it changed once it went live. Every sentence is built from the case by
// mineRow() / cosignRow() - nothing here is estimated or stored.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { askedForView, mineRows } from "@/components/dashboard/derive";
import { Pill, statusTone, type Tone } from "@/components/dashboard/shared/primitives";
import { roundState } from "@/features/cases/discussion";
import type { MineRow, MineStatus } from "@/features/cases/rows";
import styles from "./SentView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

// The four steps in the words an employee uses, not the system's.
const STEP_LABEL: Record<string, string> = { "Sent": "Sent", "Read by a human": "Read", "Decided": "Answered", "Shipped": "Live" };
// Status pill in plain words. Idea statuses (Awaiting decision, In trial, ...) already read fine.
const STATUS_LABEL: Partial<Record<MineStatus, string>> = {
  Sent: "Waiting for an answer", Approved: "Answered: yes", Declined: "Answered: no", Building: "Being built", Shipped: "Live",
};
// The second half of the life: still moving is the accent, a result is green, the rest stays quiet.
const LIFE_TONE: Partial<Record<MineStatus, Tone>> = {
  "In discussion": "accent", Planning: "ok", "In progress": "ok", Done: "ok", Measured: "ink", Recognised: "ink", Stopped: "ghost",
};

export function SentView() {
  const ctx = useDemo();
  const { seed, S, ready, href, openSheet, f } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;

  const P = seed.promiseDays;
  const mine = mineRows(ctx);
  const asked = askedForView(ctx);
  const waiting = mine.filter((m) => m.status === "Sent" || m.status === "Question for you" || m.status === "Awaiting decision" || m.status === "In discussion").length;
  const live = mine.filter((m) => m.status === "Shipped").length;
  const answered = mine.length - waiting;
  const summary = [waiting + " waiting for an answer", answered + " answered", live + " live"].join(" · ");
  const changed = (m: MineRow) => m.status === "Shipped" || m.status === "Measured" || m.status === "Recognised"; // a result is in
  const hasOutcome = (m: MineRow) => changed(m) || m.status === "Building" || m.status === "In trial";

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>What happened to what I sent</h1>
        <p className={styles.sub}>{mine.length ? summary : "Nothing sent yet"}</p>
      </div>

      {/* The promise, once, in one breath - this is the page every employee opens to check it is kept. */}
      <p className={styles.promise}>
        Everything you send lands on a named person&rsquo;s desk. They owe you a yes, a no or a question within {P} days.
        If they miss that date it moves to their deputy on its own &mdash; nothing you send can get lost.
      </p>

      {/* Discussions someone invited this person into: their view is asked before a decision. */}
      {asked.length > 0 && (
        <section className={styles.asked} aria-label="Asked for your view">
          <h2 className={styles.askedTitle}>Asked for your view</h2>
          {asked.map((c) => {
            const rs = roundState(c, S.rules, S.day);
            return (
              <Link key={c.id} href={href("/cases/" + c.id)} className={styles.askedRow}>
                <span className={styles.askedCase}>{c.title}</span>
                <span className={styles.askedMeta}>{c.discussion?.by} asked · {rs ? (rs.ready ? "ready to decide" : "round " + rs.round + " of " + rs.of + " · check-in " + f(rs.dueDay)) : ""}</span>
              </Link>
            );
          })}
        </section>
      )}

      {mine.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>You have not sent anything yet</div>
          <Link href={href("/raise")} className={styles.emptyLink}>Raise a problem or an idea &rarr;</Link>
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
              <Pill tone={LIFE_TONE[m.status] ?? statusTone(m.status)}>{STATUS_LABEL[m.status] ?? m.status}</Pill>
            </div>

            <ol className={styles.steps} aria-label="Progress" data-long={m.steps.length > 4 ? "true" : undefined}>
              {m.steps.map((s) => (
                <li key={s.label} className={styles.step} data-tone={s.tone}>
                  <span className={styles.stepBar} />
                  <span className={styles.stepLabel}>{STEP_LABEL[s.label] ?? s.label}</span>
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
                <span className={styles.outcomeL}>{changed(m) ? "What it changed" : "What it should change"}</span>
                <strong className={styles.outcomeV}>{m.outcome}</strong>
                <span className={styles.outcomeNote}>{m.outcomeNote}</span>
              </p>
            )}

            <div className={styles.foot}>
              {m.canReply && <button type="button" className={styles.answer} onClick={() => openSheet("reply", m.id)}>Answer {m.replyTo}</button>}
              {m.status === "In discussion" && <Link href={href("/cases/" + m.id)} className={styles.more}>Revise it &rarr;</Link>}
              {m.project && <Link href={href("/projects/" + m.project.id)} className={styles.more}>{m.project.label} {m.project.title} &rarr;</Link>}
              {m.kind === "case" && <Link href={href("/cases/" + m.id)} className={styles.more}>Full history &rarr;</Link>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
