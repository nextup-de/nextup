// REM-D1 (plan REM, D8): the docs a customer reads say what the code does. Each file has a table of statements it must now make and of stale ones it
// must not make any more, each checked against the code named beside it when the doc was fixed (docs-triage of 13 Nov 2026). Whitespace and line breaks
// do not count. One flat top-level test per file (D2).
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { repoRoot } from "../docs/register";

const DOCS = path.join(repoRoot(), "docs");
const flat = (s: string) => s.replace(/\s+/g, " ");
const text = (file: string) => flat(fs.readFileSync(path.join(DOCS, file), "utf8"));

type Table = { says: string[]; gone: string[] };
const TABLES: Record<string, Table> = {
  "ADMIN.md": {
    says: [
      "19 sections", // contradiction 6: Settings has 19 sections (features/settings/sections.ts)
      "chooses 1, 4, 24 or 72 hours", // inventory contradiction 7: Settings → Support access (support-code.ts SUPPORT_GRANT_CHOICES)
      "valid 24 hours (`SUPPORT_GRANT_HOURS`)", // the console's grant
      "Microsoft Teams and the OIDC, SAML and SCIM cards are not", // contradiction 6: they live in Settings
      "and the company's Microsoft tenant id", // contradiction 12: set on /admin/people
    ],
    gone: ["Connectors exist only here."],
  },
  "SETTINGS.md": {
    says: [
      "Settings has 19 sections: 17 in the menu and two out of it",
      "| Support access | `settings/support-access` |",
      "1, 4, 24 or 72 hours (4 is shown first)",
      "| Approvals | `settings/approvals` |",
      "set in the console on `/admin/people`",
    ],
    gone: ["In this order. Setup is not a section: it has its own pages, and while the company is closed the menu shows a pill that leads there.\n\n| Section | Path | What it does |\n|---|---|---|\n| Company |"],
  },
  "TEAMS.md": {
    says: ["A Teams raise has no last look and no desk choice", "lands on the fallback desk", "set in the console on `/admin/people`", "only shown in Settings -> Sign-in"], // P2.1, contradiction 12
    gone: ["routed like an app raise", "there is no last look to change it"],
  },
  "INTEGRATIONS.md": {
    says: ["`flavor` (`cloud` or `dc`; Data Center is built", "tested against a fake Jira only", "one stack per legal entity", "plants are units inside that company"], // found: Jira DC, Q8.9
    gone: ["`dc` as a seam only", "One codebase, one database, one n8n."],
  },
  "SECURITY.md": {
    says: ["personal login code plus an authenticator (TOTP) code", "`audit.access.console_signin`", "the platform admin on admin.sellux.ch stays open"], // contradiction 8
    gone: ["Still open: 2FA of our own", "Started: on a company stack"],
  },
  "ASSISTANT.md": {
    says: [
      "through `streamingFor`", // C5
      "The pilot runs on Azure OpenAI",
      "nobody: off, \"waits for the data-processing agreement\"", // C1
      "`/admin/assistant` → Assistant → Off", // C2
      "The AI provider and its prices are on `/admin/connectors` → AI provider",
      "`/admin/knowledge` only redirects to Company data", // contradiction 5
    ],
    gone: [
      "| real stage, on, no DPA date | mock only, no model call |",
      "`/admin/knowledge` → Assistant",
      "names AWS (Bedrock, EU regions per the chosen routing) as sub-processor",
      "The mock is chosen whenever",
    ],
  },
  "customer/OPERATIONS.md": {
    says: ["required reviewer is Kevin (NextUp)", "is a real `restore` on a **spare VM**", "run only `restore-test`", "throwaway database"], // contradictions 1 and 4 (ch10)
    gone: ["on a spare VM or the live one", "Required reviewers on the environment mean nothing is released without an approval from the person you name"],
  },
  "customer/INSTALL.md": {
    says: [
      "are not part of it",
      "are added to `.env` by the first `stack/backup.sh <slug> backup` run",
      "Copy `CONNECTOR_VAULT_KEY` into your password manager now",
      "`RESTIC_PASSWORD` as soon as the first backup has run",
    ], // RESTIC_PASSWORD
    gone: ["freshly generated secrets (database password, `AUTH_SECRET`, `CONNECTOR_VAULT_KEY`, `RESTIC_PASSWORD`)"],
  },
  "compliance/WORKS_AGREEMENT_TEMPLATE.md": {
    says: ["The handle is only a label", "every event still stores the author's user id (`actorUserId`)", "finds them in their own privacy export"], // gap 3
    gone: [],
  },
  "compliance/README.md": {
    says: ["| `AI_INFORMATION.md` |", "Draft, Marc to review"], // P9.1:inform
    gone: [],
  },
};

for (const [file, table] of Object.entries(TABLES)) {
  it(`REM docs customer ${file} says what the code does`, () => {
    const doc = text(file);
    for (const phrase of table.says) expect(doc, `${file} must say: ${phrase}`).toContain(flat(phrase));
    for (const phrase of table.gone) expect(doc, `${file} must no longer say: ${phrase}`).not.toContain(flat(phrase));
  });
}

it("REM docs customer AI_INFORMATION.md says what the code does", () => {
  const raw = fs.readFileSync(path.join(DOCS, "compliance/AI_INFORMATION.md"), "utf8");
  // The sheet exists and is marked as a draft for Marc, as the plan's default says: nobody hands it out before he has reviewed it.
  expect(raw.split("\n")[0]).toMatch(/^Updated \d{4}-\d{2}-\d{2} · Draft, Marc to review, not legal advice\.$/);
  const doc = flat(raw);
  for (const phrase of ["**Draft, Marc to review.**", "AI Act Art. 26(7) and Art. 50", "`aiInfo`", "`aiGate`", "takes **no decision about a person**", "Raise it anyway"]) {
    expect(doc, phrase).toContain(flat(phrase));
  }
  // What it names exists in the code: the agreement kind and the gate.
  const agreements = fs.readFileSync(path.join(repoRoot(), "apps/app/src/features/pilot/agreements.ts"), "utf8");
  expect(agreements).toContain('"aiInfo"');
  expect(fs.existsSync(path.join(repoRoot(), "apps/app/src/features/ai/gate.ts"))).toBe(true);
});
