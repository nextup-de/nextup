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
import { FIXTURE_AREAS, loadFixtures, zodExports } from "./fixtures";

type Schema = { safeParse: (v: unknown) => { success: boolean } };
const exportsByName = pub as unknown as Record<string, unknown>;

function fixtureValue(schema: string): unknown {
  const f = loadFixtures().find((x) => x.schema === schema);
  if (!f) throw new Error(`missing fixture for ${schema}`);
  return f.value;
}

function info<K extends pub.ConnectorKind>(kind: K): pub.ConnectorInfo & { kind: K } {
  return { ...pub.ConnectorInfo.parse(fixtureValue("ConnectorInfo")), kind };
}

describe("ARC acceptance: canonical model, connector interfaces and API v1 schemas accept the fixtures", () => {
  it("every fixture names an exported schema and is accepted by it", () => {
    for (const area of FIXTURE_AREAS) {
      for (const f of loadFixtures(area)) {
        const schema = exportsByName[f.schema] as Schema | undefined;
        expect(typeof schema?.safeParse, `${f.file}: no schema export named ${f.schema}`).toBe("function");
        expect(schema!.safeParse(f.value).success, f.file).toBe(true);
      }
    }
  });

  it("every exported schema has at least one fixture (D12)", () => {
    const withFixture = new Set(loadFixtures().map((f) => f.schema));
    for (const [name] of zodExports(exportsByName)) {
      expect(withFixture.has(name), `${name} has no fixture`).toBe(true);
    }
  });

  it("the canonical names, ApiV1 and CONNECTOR_KINDS exist", () => {
    const names = ["Person", "OrgUnit", "Role", "RoleHolder", "CaseRef", "Decision", "ProjectRef", "WebhookEnvelope"];
    const zod = new Set(zodExports(exportsByName).map(([n]) => n));
    for (const n of names) expect(zod.has(n), n).toBe(true);
    expect(typeof pub.ApiV1).toBe("object");
    expect(pub.ApiV1.version).toBe(1);
    expect(pub.ApiV1.endpoints.length).toBeGreaterThan(0);
    expect([...pub.CONNECTOR_KINDS]).toEqual([
      "IdentityProvider",
      "DirectorySource",
      "NotifyChannel",
      "CaseSource",
      "WorkTracker",
      "KnowledgeSource",
      "LogSink",
      "AiProvider",
    ]);
  });

  it("a typed fake of each interface returns data its schema accepts", async () => {
    const identity = {
      info: info("IdentityProvider"),
      startLogin: async () => pub.LoginStart.parse(fixtureValue("LoginStart")),
      completeLogin: async () => pub.IdentityClaims.parse(fixtureValue("IdentityClaims")),
    } satisfies IdentityProvider;
    const directory = {
      info: info("DirectorySource"),
      delta: async () => pub.DirectoryPage.parse(fixtureValue("DirectoryPage")),
    } satisfies DirectorySource;
    const notify = {
      info: info("NotifyChannel"),
      send: async () => pub.NotifyResult.parse(fixtureValue("NotifyResult")),
    } satisfies NotifyChannel;
    const caseSource = {
      info: info("CaseSource"),
      receive: async () => pub.CaseInput.parse(fixtureValue("CaseInput")),
    } satisfies CaseSource;
    const tracker = {
      info: info("WorkTracker"),
      ensureContainer: async () => pub.WorkItemRef.parse(fixtureValue("WorkItemRef")),
      ensureItem: async () => pub.WorkItemRef.parse(fixtureValue("WorkItemRef")),
      setSummary: async () => {},
      moveItem: async () => {},
      markRemoved: async () => {},
      changes: async () => pub.WorkChangePage.parse(fixtureValue("WorkChangePage")),
    } satisfies WorkTracker;
    const knowledge = {
      info: info("KnowledgeSource"),
      search: async () => [pub.KnowledgeHit.parse(fixtureValue("KnowledgeHit"))],
    } satisfies KnowledgeSource;
    const log = {
      info: info("LogSink"),
      write: async () => {},
    } satisfies LogSink;
    const ai = {
      info: info("AiProvider"),
      complete: async () => pub.AiResponse.parse(fixtureValue("AiResponse")),
    } satisfies AiProvider;

    const fakes = [identity, directory, notify, caseSource, tracker, knowledge, log, ai];
    expect(fakes.map((f) => f.info.kind)).toEqual([...pub.CONNECTOR_KINDS]);

    const companyId = "co_1";
    const login = await identity.startLogin();
    expect(pub.LoginStart.safeParse(login).success).toBe(true);
    const callback = pub.LoginCallback.parse(fixtureValue("LoginCallback"));
    expect(pub.IdentityClaims.safeParse(await identity.completeLogin()).success).toBe(true);
    expect(callback.state.length).toBeGreaterThan(0);
    expect(pub.DirectoryPage.safeParse(await directory.delta()).success).toBe(true);
    expect(pub.NotifyResult.safeParse(await notify.send()).success).toBe(true);
    expect(pub.CaseInput.safeParse(await caseSource.receive()).success).toBe(true);
    expect(pub.WorkItemRef.safeParse(await tracker.ensureContainer()).success).toBe(true);
    expect(pub.WorkItemRef.safeParse(await tracker.ensureItem()).success).toBe(true);
    await expect(tracker.setSummary()).resolves.toBeUndefined();
    await expect(tracker.moveItem()).resolves.toBeUndefined();
    await expect(tracker.markRemoved()).resolves.toBeUndefined();
    expect(pub.WorkChangePage.safeParse(await tracker.changes()).success).toBe(true);
    const hits = await knowledge.search();
    for (const h of hits) expect(pub.KnowledgeHit.safeParse(h).success).toBe(true);
    await expect(log.write()).resolves.toBeUndefined();
    expect(pub.AiResponse.safeParse(await ai.complete()).success).toBe(true);
    expect(companyId).toBeTruthy();
  });

  it("every ApiV1 endpoint schema is an export with a fixture in fixtures/api-v1", () => {
    const apiFixtures = new Set(loadFixtures("api-v1").map((f) => f.schema));
    for (const ep of pub.ApiV1.endpoints) {
      for (const key of ["query", "request", "response"] as const) {
        const schema: unknown = ep[key];
        if (schema === null) continue;
        const name = Object.keys(exportsByName).find((n) => exportsByName[n] === schema);
        expect(name, `${ep.id}.${key} is not an export of public`).toBeDefined();
        expect(apiFixtures.has(name!), `${ep.id}.${key} (${name}) has no fixture in api-v1/`).toBe(true);
      }
    }
  });
});
