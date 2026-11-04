// ARC-S1: the Prisma schema is one file per area (docs/adr/0007-areas.md). Reads files only; no Prisma run.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "../../..");
const SCHEMA = join(APP, "prisma/schema");
const ADR = join(APP, "../../docs/adr/0007-areas.md");

const AREAS: Record<string, string[]> = {
  "core.prisma": ["Company", "CaseEvent", "IdeaDraft", "IdeaTurn", "AssistTurn"],
  "structure.prisma": ["CompanyProfile", "OrgUnit", "OrgRole", "OrgRoleHolder", "RoutingRule", "Goal"],
  "auth.prisma": ["User", "ApiToken"],
  "integrations.prisma": ["CompanyConfig", "Connection", "Integration", "Document", "OutboxMessage", "WebhookSubscription", "NotifyPreference", "NotifyCursor", "TeamsConversation", "AiCall"],
  "support.prisma": ["SupportGrant"],
  "ops.prisma": ["FeatureFlag", "PilotRequest", "PilotReply", "Ticket", "TicketReply", "ErrorGroup"],
};
const PHASES = [
  "AUD", "ARC", "OPS", "STR", "LNG", "CON", "IDN", "CLK", "DIR", "AIP", "ADM", "VIS", "NTF",
  "GDP", "LOOP", "MET", "TMS", "FLR", "API", "EID", "SEC", "TST", "PIL", "ITC",
];

const read = (file: string) => readFileSync(join(SCHEMA, file), "utf8");

describe("ARC schema split", () => {
  it("has no single-file prisma/schema.prisma any more", () => {
    expect(existsSync(join(APP, "prisma/schema.prisma"))).toBe(false);
  });

  it("holds exactly the five area files", () => {
    expect(readdirSync(SCHEMA).sort()).toEqual(Object.keys(AREAS).sort());
  });

  it("declares every model in exactly its file and in no other", () => {
    for (const [file, models] of Object.entries(AREAS)) {
      for (const m of models) {
        for (const other of Object.keys(AREAS)) {
          const has = new RegExp(`^model ${m} \{`, "m").test(read(other));
          expect(has, `${m} in ${other}`).toBe(other === file);
        }
      }
    }
  });

  it("keeps generator client and datasource db in core.prisma only", () => {
    for (const file of Object.keys(AREAS)) {
      const s = read(file);
      expect(/^generator client \{/m.test(s), `generator in ${file}`).toBe(file === "core.prisma");
      expect(/^datasource db \{/m.test(s), `datasource in ${file}`).toBe(file === "core.prisma");
    }
  });

  it("starts each file with the area comment", () => {
    for (const file of Object.keys(AREAS)) {
      const name = file.replace(".prisma", "");
      expect(read(file).startsWith(`// Area ${name} (docs/adr/0007-areas.md). Models: `), file).toBe(true);
    }
  });

  it("points prisma7.config.ts at the folder", () => {
    expect(readFileSync(join(APP, "prisma7.config.ts"), "utf8")).toContain('schema: "prisma/schema"');
  });

  it("names every area file and phase in ADR 0007", () => {
    const adr = readFileSync(ADR, "utf8");
    for (const file of Object.keys(AREAS)) expect(adr, file).toContain(file);
    for (const p of PHASES) expect(adr, p).toMatch(new RegExp("\\b" + p + "\\b"));
  });
});
