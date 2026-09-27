// Overview: what needs you right now, and the numbers at a glance. Every detail lives on its own
// page (Requests, Companies, Connections); this one only points at them.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase, connectionProblems } from "@/features/admin/nav";
import { STAGES } from "@/features/admin/stages";
import { RequestList } from "@/components/admin/RequestList";
import styles from "./admin.module.css";

export default async function AdminOverview() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const base = adminBase();

  const problems = connectionProblems({
    database: ctx.database.state,
    automation: ctx.automation?.summary.state ?? null,
    tasks: ctx.taskCounts,
    mail: ctx.mailState,
  });
  const byStage = STAGES.map((s) => ({ stage: s, n: ctx.companies.filter((c) => c.stage === s).length }));
  // Oldest first: the one closest to breaking the two-working-day promise is the one to answer.
  const waiting = [...ctx.open].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 5);

  return (
    <>
      <section className={styles.card}>
        <h1>Overview</h1>
        <div className={styles.counts}>
          <a className={styles.count} href={`${base}/requests`} data-tone={ctx.overdue.length ? "bad" : ctx.open.length ? "warn" : undefined}>
            <span className={styles.countValue}>{ctx.open.length}</span>
            <span className={styles.countLabel}>
              open {ctx.open.length === 1 ? "request" : "requests"}
              {ctx.overdue.length ? ` · ${ctx.overdue.length} overdue` : ""}
            </span>
          </a>
          <a className={styles.count} href={`${base}/companies`}>
            <span className={styles.countValue}>{ctx.companies.length}</span>
            <span className={styles.countLabel}>{ctx.companies.length === 1 ? "company" : "companies"}</span>
          </a>
          {byStage.map((s) => (
            <a key={s.stage} className={styles.count} href={`${base}/companies`}>
              <span className={styles.countValue}>{s.n}</span>
              <span className={styles.countLabel}>in {s.stage}</span>
            </a>
          ))}
          <a className={styles.count} href={`${base}/connections`} data-tone={problems[0]?.tone}>
            <span className={styles.countValue}>{problems.length === 0 ? "OK" : problems.length}</span>
            <span className={styles.countLabel}>{problems.length === 0 ? "connections" : problems.map((p) => p.badge).join(" · ")}</span>
          </a>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Waiting for a reply</h2>
          <a href={`${base}/requests`} className="nh-btn nh-btn-ghost nh-btn-sm">All requests</a>
        </div>
        <p className="nh-hint">
          {ctx.open.length === 0
            ? "Nothing open. Every real submit of the /contact form lands in Requests."
            : `Oldest first. ${ctx.overdue.length ? `${ctx.overdue.length} past the two-working-day promise.` : "None past the two-working-day promise yet."}`}
        </p>
        <RequestList requests={waiting} base={base} view="open" />
      </section>

      {problems.length ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Connections need a look</h2>
            <a href={`${base}/connections`} className="nh-btn nh-btn-ghost nh-btn-sm">Open Connections</a>
          </div>
          <ul className={styles.problemList}>
            {problems.map((p) => (
              <li key={p.badge} data-tone={p.tone}>{p.badge}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {ctx.live ? (
        <section className={styles.card}>
          <h2>Next steps</h2>
          <div className={styles.quick}>
            <a className="nh-btn nh-btn-ghost" href={`${base}/companies#new`}>Add a company</a>
            <a className="nh-btn nh-btn-ghost" href={`${base}/requests?view=all`}>Search requests</a>
            <a className="nh-btn nh-btn-ghost" href={`${base}/connections#automation`}>Check notices</a>
          </div>
        </section>
      ) : null}
    </>
  );
}
