import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as pub from "@nextup/contracts/public";
import type {
  AiProvider,
  CaseSource,
  DirectorySource,
  IdentityProvider,
  KnowledgeSource,
  LogSink,
  NotifyChannel,
  WorkTracker,
} from "@nextup/contracts/public";
import { loadFixtures } from "./fixtures";

type Schema = { safeParse: (v: unknown) => { success: boolean } };
const schemas = pub as unknown as Record<string, Schema>;

function fixture(schema: string, name: string): unknown {
  const f = loadFixtures("connectors").find((x) => x.schema === schema && x.name === name);
  if (!f) throw new Error(`missing fixture ${schema}.${name}`);
  return f.value;
}
function accepts(names: string[]) {
  for (const name of names) {
    const fx = loadFixtures("connectors").filter((f) => f.schema === name);
    expect(fx.length, name).toBeGreaterThan(0);
    for (const f of fx) expect(schemas[name].safeParse(f.value).success, f.file).toBe(true);
  }
}
const ok = (name: string, v: unknown) => expect(schemas[name].safeParse(v).success, name).toBe(true);
const no = (name: string, v: unknown) => expect(schemas[name].safeParse(v).success, name).toBe(false);
const info = <K extends string>(kind: K) => ({ kind, id: "fake-adapter", contractVersion: 1 as const });

describe("ARC connector interfaces", () => {
  it("IdentityProvider", async () => {
    accepts(["LoginStart", "LoginCallback", "IdentityClaims"]);
    no("LoginStart", { redirectUrl: "https://x.example", state: "short" });
    no("LoginCallback", { state: "st_0123456789abcdef", params: { a: 1 } });
    no("IdentityClaims", { ...(fixture("IdentityClaims", "entra") as object), email: "not-an-email" });
    const fake = {
      info: info("IdentityProvider"),
      startLogin: async () => fixture("LoginStart", "oidc") as pub.LoginStart,
      completeLogin: async () => fixture("IdentityClaims", "saml") as pub.IdentityClaims,
    } satisfies IdentityProvider;
    ok("LoginStart", await fake.startLogin());
    ok("IdentityClaims", await fake.completeLogin());
  });

  it("DirectorySource", async () => {
    accepts(["DirectoryEntry", "DirectoryGroup", "DirectoryPage"]);
    no("DirectoryPage", { entries: [], groups: [], removedExternalIds: [] });
    no("DirectoryEntry", { ...(fixture("DirectoryEntry", "basic") as object), active: "yes" });
    const fake = {
      info: info("DirectorySource"),
      delta: async () => fixture("DirectoryPage", "graph-delta") as pub.DirectoryPage,
    } satisfies DirectorySource;
    ok("DirectoryPage", await fake.delta());
  });

  it("NotifyChannel", async () => {
    accepts(["NotifyMessage", "NotifyResult"]);
    no("NotifyResult", { ok: false, error: "x" });
    no("NotifyMessage", { ...(fixture("NotifyMessage", "case-raised") as object), locale: "fr" });
    const fake = {
      info: info("NotifyChannel"),
      send: async () => fixture("NotifyResult", "ok") as pub.NotifyResult,
    } satisfies NotifyChannel;
    ok("NotifyResult", await fake.send());
  });

  it("CaseSource", async () => {
    accepts(["CaseInput"]);
    no("CaseInput", { ...(fixture("CaseInput", "teams") as object), kind: "complaint" });
    const fake = {
      info: info("CaseSource"),
      receive: async () => fixture("CaseInput", "teams") as pub.CaseInput,
      acknowledge: async () => undefined,
    } satisfies CaseSource;
    ok("CaseInput", await fake.receive());
    await fake.acknowledge();
  });

  it("WorkTracker", async () => {
    accepts(["WorkItemState", "WorkItemRef", "WorkChange", "WorkChangePage"]);
    no("WorkItemState", "review");
    no("WorkChange", { ...(fixture("WorkChange", "state") as object), kind: "deleted" });
    const ref = fixture("WorkItemRef", "jira") as pub.WorkItemRef;
    const fake = {
      info: info("WorkTracker"),
      ensureContainer: async () => ref,
      ensureItem: async () => ref,
      setSummary: async () => undefined,
      moveItem: async () => undefined,
      markRemoved: async () => undefined,
      changes: async () => fixture("WorkChangePage", "jira") as pub.WorkChangePage,
    } satisfies WorkTracker;
    ok("WorkItemRef", await fake.ensureContainer());
    ok("WorkItemRef", await fake.ensureItem());
    await fake.setSummary();
    await fake.moveItem();
    await fake.markRemoved();
    ok("WorkChangePage", await fake.changes());
  });

  it("KnowledgeSource", async () => {
    accepts(["KnowledgeQuery", "KnowledgeHit"]);
    no("KnowledgeQuery", { ...(fixture("KnowledgeQuery", "basic") as object), size: 21 });
    no("KnowledgeHit", { ...(fixture("KnowledgeHit", "m365") as object), classification: "secret" });
    const fake = {
      info: info("KnowledgeSource"),
      search: async () => [fixture("KnowledgeHit", "m365") as pub.KnowledgeHit],
    } satisfies KnowledgeSource;
    for (const hit of await fake.search()) ok("KnowledgeHit", hit);
  });

  it("LogSink", async () => {
    accepts(["LogRecord"]);
    no("LogRecord", { ...(fixture("LogRecord", "audit") as object), type: "case.decided" });
    const fake = { info: info("LogSink"), write: async () => undefined } satisfies LogSink;
    await fake.write();
    ok("LogRecord", fixture("LogRecord", "audit"));
  });

  it("AiProvider", async () => {
    accepts(["AiProviderChoice", "AiMessage", "AiRequest", "AiResponse"]);
    no("AiProviderChoice", "gemini");
    no("AiRequest", { ...(fixture("AiRequest", "routing") as object), messages: [] });
    const fake = {
      info: info("AiProvider"),
      complete: async () => fixture("AiResponse", "basic") as pub.AiResponse,
    } satisfies AiProvider;
    ok("AiResponse", await fake.complete());
  });

  it("ADR 0002 has a section and a Checked against line per interface", () => {
    const adr = readFileSync(join(__dirname, "../../../../../docs/adr/0002-connector-interfaces.md"), "utf8");
    for (const name of pub.CONNECTOR_KINDS) {
      const m = new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(adr);
      expect(m, `## ${name}`).not.toBeNull();
      expect(m![1], name).toMatch(/^Checked against: [^,\n]+, [^,\n]+$/m);
    }
  });
});
