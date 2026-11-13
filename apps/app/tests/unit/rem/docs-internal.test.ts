// REM-D2: the internal docs and plans say what the code does. Each file has a table of statements it must make and
// stale ones it must no longer make. Plain text, whitespace flattened, so a re-wrapped line still matches.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repoRoot } from "../docs/register";

type Table = { says: string[]; gone: string[] };

const TABLES: Record<string, Table> = {
  "docs/IDEAS.md": {
    says: [
      "Publish idea (opens once the rail is done)",
      "Saved 22:19",
      "CompanyConfig.publishThreshold",
      "/admin/company-data",
      "features/ideas/desks.ts",
      "Choose another desk",
      "docs/process/MOV.md",
    ],
    gone: ["Publish idea (locked below the line)", "set on `/admin/knowledge`", "Escalating a late step", "features/ideas/receivers.ts", "Who should get this?"],
  },
  "docs/LOOP.md": {
    says: ["question_days", "no_reason_min", "appeal_days", "escalation_days", "Then one level up after", "clock.due", "reminder.escalation", "fallbackSeat"],
    gone: ["fixed numbers, not company rules yet", "**fallback desk**: the occupied seat at the head of the org chart"],
  },
  "docs/CLOCK.md": {
    says: ["question_days", "## A late answer", "escalation_days", "clk:escalate:", "deadline_handover", "case.handed"],
    gone: ["fixed numbers, not company rules yet"],
  },
  "docs/NOTIFICATIONS.md": {
    says: ["A late answer's second level", "reminder.escalation", "CASE_REMINDER_AUDIENCE"],
    gone: [],
  },
  "docs/ROUTES.md": {
    says: ["SimpleShell", "src/proxy.ts", "(app)/layout.tsx"],
    gone: ["arrives with sessions in Phase 2", "AppShell: rail + top bar"],
  },
  "docs/plans/2026-11-08_project-workflows.md": {
    says: [
      "The four workflow modes",
      "picked on the project draft by its lead, before Start",
      "project.template",
      "`project.mode` is not built yet",
      "The agent is not a fifth mode",
      "agent.switched",
      "no separate send or move switches",
    ],
    gone: ["five workflow modes", "AI-orchestrated", "Agent settings (mode", "can change until Start"],
  },
  "docs/plans/2026-11-08_decision-stages.md": {
    says: ["Four workflow modes", "agent.switched", "There are no send or move switches", "AGT D22", "`project.mode` is not built"],
    gone: ["Five workflow modes", "AI-orchestrated", "project.agent { read, draft, suggest }", "send without asking and move steps are off"],
  },
  "docs/plans/2026-10-29_jira-in-app.md": {
    says: ["/admin/connectors", "JiraBlock", "CONSOLE_SECTIONS"],
    gone: ["**Admin page `/admin/integrations`**", "sets Jira up in `/admin/integrations`", "JiraAdmin.tsx"],
  },
  "docs/plans/2026-10-15_idea-to-project.md": {
    says: ["a late step is chased", "the day after its due day", "../process/MOV.md"],
    gone: ["there are no per-person overdue counts"],
  },
};

const flat = (s: string) => s.replace(/\s+/g, " ");

for (const [file, table] of Object.entries(TABLES)) {
  it(`REM docs internal ${file} says what the code does`, () => {
    const text = flat(readFileSync(join(repoRoot(), file), "utf8"));
    for (const phrase of table.says) expect(text, `${file} should say: ${phrase}`).toContain(flat(phrase));
    for (const phrase of table.gone) expect(text, `${file} should no longer say: ${phrase}`).not.toContain(flat(phrase));
  });
}
