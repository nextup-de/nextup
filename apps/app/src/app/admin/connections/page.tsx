// Connections: everything the app talks to, on one page - Postgres, the case notices and what they
// did, the mail relay, and the server's own configuration. The strip at the top is the verdict for each; the
// cards below are the detail.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase, type Tone } from "@/features/admin/nav";
import { describeEnvironment } from "@/features/admin/environment";
import { DatabaseCard } from "@/components/admin/DatabaseCard";
import { Automation } from "@/components/admin/Automation";
import { AutomationTasks } from "@/components/admin/AutomationTasks";
import { MailCard } from "@/components/admin/MailCard";
import { EnvironmentCard } from "@/components/admin/EnvironmentCard";
import styles from "../admin.module.css";

export default async function ConnectionsPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const env = describeEnvironment(process.env);

  const automationState = ctx.automation?.summary.state ?? null;
  const strip: { id: string; label: string; value: string; tone: Tone }[] = [
    {
      id: "database",
      label: "Database",
      value: ctx.database.state === "up" ? "answering" : ctx.database.state === "off" ? "not set" : "down",
      tone: ctx.database.state === "up" ? "ok" : "bad",
    },
    {
      id: "automation",
      label: "Notices",
      value: automationState ?? "needs the database",
      tone: automationState === "live" ? "ok" : automationState === "idle" || automationState === "off" ? "warn" : "bad",
    },
    {
      id: "tasks",
      label: "Tasks",
      value: !ctx.taskCounts
        ? "needs the database"
        : ctx.taskCounts.failed
          ? `${ctx.taskCounts.failed} stuck`
          : `${ctx.tasks.length} recent`,
      tone: !ctx.taskCounts ? "bad" : ctx.taskCounts.failed ? "bad" : ctx.taskCounts.pending ? "warn" : "ok",
    },
    {
      id: "mail",
      label: "Mail",
      value: ctx.mailState === "up" ? "answering" : ctx.mailState === "off" ? "not set" : "down",
      tone: ctx.mailState === "up" ? "ok" : ctx.mailState === "off" ? "warn" : "bad",
    },
    {
      id: "environment",
      label: "Environment",
      value: env.some((r) => r.tone === "bad") ? "needs fixing" : env.some((r) => r.tone === "warn") ? "demo settings on" : "ok",
      tone: env.some((r) => r.tone === "bad") ? "bad" : env.some((r) => r.tone === "warn") ? "warn" : "ok",
    },
  ];

  return (
    <>
      <section className={styles.card}>
        <h1>Connections</h1>
        <p className="nh-hint">Everything the app talks to, and whether it answers.</p>
        <nav className={styles.strip} aria-label="Connections">
          {strip.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={styles.stripItem} data-tone={s.tone}>
              <span className={styles.stripLabel}>
                <span className={styles.dot} aria-hidden="true" />
                {s.label}
              </span>
              <span className={styles.rowMeta}>{s.value}</span>
            </a>
          ))}
        </nav>
      </section>

      <section className={styles.card} id="database">
        <h2>Database</h2>
        <p className="nh-hint">
          Where the data comes from, and whether the schema in front of us is the one this build expects.
        </p>
        <DatabaseCard report={ctx.database} />
      </section>

      <section className={styles.card} id="automation">
        <h2>Case notices</h2>
        <p className="nh-hint">
          When a case is raised the app emails the route owner through the mail relay below, then
          notes it on the case.
        </p>
        {ctx.automation ? (
          <Automation report={ctx.automation} />
        ) : (
          <p className="nh-hint">Read from the event log, so it shows once the database answers.</p>
        )}
      </section>

      <section className={styles.card} id="tasks">
        <h2>Notice tasks</h2>
        <p className="nh-hint">
          One row per raise, and whether its owner was told. A raise and its notice are paired by
          the notice&apos;s idempotency key, so nothing here is guessed.
        </p>
        {ctx.automation ? (
          <AutomationTasks tasks={ctx.tasks} />
        ) : (
          <p className="nh-hint">Shows once the database answers.</p>
        )}
      </section>

      <section className={styles.card} id="mail">
        <h2>Mail</h2>
        <p className="nh-hint">Sends the case notices above, and &ldquo;Send reply&rdquo; on a pilot request.</p>
        <MailCard status={ctx.mail} />
      </section>

      <section className={styles.card} id="environment">
        <h2>Environment</h2>
        <p className="nh-hint">What this server was started with. Values of secrets are never shown - only whether they are safe.</p>
        <EnvironmentCard rows={env} />
      </section>
    </>
  );
}
