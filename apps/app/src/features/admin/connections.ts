// The Connections verdicts - database, notices, tasks, mail, environment - one line each. Pure, so
// the platform /admin page and the health report a stack sends to admin.sellux.ch
// (server/health-report.ts) say exactly the same thing. tests/unit/admin-connections.test.ts.
import type { DatabaseState } from "./health";
import type { EnvRow } from "./environment";
import type { Tone } from "./nav";
import type { AutomationState } from "@/features/integrations/automation";
import type { TaskCounts } from "@/features/integrations/tasks";

export type ConnectionCheck = { id: string; label: string; value: string; tone: Tone; detail?: string };

export type ConnectionFacts = {
  database: DatabaseState;
  /** The database card's one-line headline, e.g. "Nothing answers at db:5432". */
  databaseHeadline?: string;
  /** null = not read, because the database is not there. */
  automation: AutomationState | null;
  taskCounts: TaskCounts | null;
  /** How many recent raises the task list holds. */
  taskTotal: number;
  mail: "off" | "down" | "up";
  environment: EnvRow[];
};

export function connectionChecks(f: ConnectionFacts): ConnectionCheck[] {
  const env = f.environment;
  return [
    {
      id: "database",
      label: "Database",
      value: f.database === "up" ? "answering" : f.database === "off" ? "not set" : "down",
      tone: f.database === "up" ? "ok" : "bad",
      ...(f.database === "up" || !f.databaseHeadline ? {} : { detail: f.databaseHeadline }),
    },
    {
      id: "automation",
      label: "Notices",
      value: f.automation ?? "needs the database",
      tone: f.automation === "live" ? "ok" : f.automation === "idle" || f.automation === "off" ? "warn" : "bad",
    },
    {
      id: "tasks",
      label: "Tasks",
      value: !f.taskCounts ? "needs the database" : f.taskCounts.failed ? `${f.taskCounts.failed} stuck` : `${f.taskTotal} recent`,
      tone: !f.taskCounts ? "bad" : f.taskCounts.failed ? "bad" : f.taskCounts.pending ? "warn" : "ok",
    },
    {
      id: "mail",
      label: "Mail",
      value: f.mail === "up" ? "answering" : f.mail === "off" ? "not set" : "down",
      tone: f.mail === "up" ? "ok" : f.mail === "off" ? "warn" : "bad",
    },
    {
      id: "environment",
      label: "Environment",
      value: env.some((r) => r.tone === "bad") ? "needs fixing" : env.some((r) => r.tone === "warn") ? "demo settings on" : "ok",
      tone: env.some((r) => r.tone === "bad") ? "bad" : env.some((r) => r.tone === "warn") ? "warn" : "ok",
    },
  ];
}
