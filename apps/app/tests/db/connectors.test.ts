// CNX acceptance on the proof database: Microsoft 365 search is switchable per company and passes the 21
// ground-truth questions (D9), and the in-app Jira sync creates and pulls issues against the fake Jira for Cloud
// and for Data Center, with the work tracker reachable through workTrackerFor. Own company, own users, no live call.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { integrationContext, seal, vaultContext } from "@/features/connectors/vault";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { seedFor } from "@/features/demo";
import { JIRA_ACTOR } from "@/features/integrations";
import { getDb } from "@/lib/db/client";
import { m365SearchOn, saveConnection, setM365Search } from "@/lib/db/connections";
import { loadLog } from "@/lib/db/events";
import { getIntegration, JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";
import { workTrackerFor } from "@/server/connectors/work";
import { syncCompany } from "@/server/jira-sync";
import { startFakeJira, EPIC_TYPE, TASK_TYPE } from "../fake-jira/fake-jira";
import { ceilingFor, checkGroundTruth, loadQuestions, loadResponse, PERSONA_GROUPS } from "../fixtures/graph/fixtures";

const db = getDb();
const SLUG = "cnx-z1";
const TENANT = "11111111-2222-3333-4444-555555555555";
const VAULT_KEY = "ab".repeat(32);
const ENV = { CONNECTOR_VAULT_KEY: VAULT_KEY, ENTRA_CLIENT_ID: "cnx-client", ENTRA_CLIENT_SECRET: "cnx-secret" } as const;
const savedEnv: Record<string, string | undefined> = {};

let company: { id: string; slug: string };
const userIdOf = new Map<string, string>(); // persona -> user id
const personaOf = new Map<string, string>(); // user id -> persona

beforeAll(async () => {
  for (const k of Object.keys(ENV)) savedEnv[k] = process.env[k];
  Object.assign(process.env, ENV);
  await db.company.deleteMany({ where: { slug: { startsWith: SLUG } } });
  company = await db.company.create({
    data: { slug: SLUG, name: "CNX Z1", seedJson: toSeedJson(SEED) as object, entraTenantId: TENANT },
    select: { id: true, slug: true },
  });
  for (const persona of Object.keys(PERSONA_GROUPS)) {
    const u = await db.user.create({
      data: { companyId: company.id, name: persona, email: `${persona}@cnx-z1.example`, role: "member" },
      select: { id: true },
    });
    userIdOf.set(persona, u.id);
    personaOf.set(u.id, persona);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await db.company.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await db.$disconnect();
});

describe("CNX acceptance: ground truth 21 of 21 and Jira Cloud and Data Center sync", () => {
  it("is switchable: Microsoft 365 search per company, and no work tracker before a Jira row exists", async () => {
    expect(await m365SearchOn(company.id)).toBe(false);
    await setM365Search(company.id, false);
    expect(await knowledgeSourcesFor(company.id)).toEqual([]);
    await setM365Search(company.id, true);
    const sources = await knowledgeSourcesFor(company.id);
    expect(sources.map((s) => s.info.id)).toEqual(["m365"]);
    await setM365Search(company.id, false);
    expect(await knowledgeSourcesFor(company.id)).toEqual([]);

    expect(await getIntegration(company.id, JIRA)).toBeNull();
    expect(await workTrackerFor(company.id)).toBeNull();
  });

  it("passes ground truth 21 of 21 (D9), each person's search using only their own Graph token", async () => {
    const questions = loadQuestions();
    expect(questions).toHaveLength(21);

    const vault = Buffer.from(VAULT_KEY, "hex");
    for (const [persona, userId] of userIdOf) {
      await saveConnection({
        companyId: company.id,
        userId,
        scopes: ["Files.Read.All", "offline_access"],
        refreshTokenSealed: seal(`rt-${userId}`, vault, vaultContext(company.id, userId)),
      });
      expect(persona).toBeTruthy();
    }
    await setM365Search(company.id, true);

    let current = "";
    let tokenUsers: string[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)) {
        const refresh = new URLSearchParams(String(init?.body)).get("refresh_token") ?? "";
        const userId = refresh.replace(/^rt-/, "");
        if (!personaOf.has(userId)) return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: `at-${userId}`, expires_in: 3600 });
      }
      if (url === "https://graph.microsoft.com/v1.0/search/query" && init?.method === "POST") {
        const auth = new Headers(init.headers).get("authorization") ?? "";
        const userId = auth.replace(/^Bearer at-/, "");
        tokenUsers.push(personaOf.get(userId) ?? `unknown:${userId}`);
        const fixture = loadResponse(current);
        return Response.json(fixture.body, { status: fixture.status });
      }
      if (/^https:\/\/(login\.microsoftonline|graph\.microsoft)\.com\//.test(url)) throw new Error(`unexpected Microsoft call: ${url}`);
      return real(input, init);
    });

    const [source] = await knowledgeSourcesFor(company.id);
    expect(source?.info.id).toBe("m365");

    const results = [];
    for (const q of questions) {
      current = q.id;
      tokenUsers = [];
      const userId = userIdOf.get(q.asPersona);
      expect(userId, `no user for persona ${q.asPersona}`).toBeTruthy();
      const hits = await source.search({ companyId: company.id, userId: userId!, text: q.question, ceiling: ceilingFor(q), size: 10 });
      results.push(checkGroundTruth(q, hits, tokenUsers));
    }

    const failed = results.filter((r) => !r.pass);
    const report = failed
      .map((r) => `${r.id}: missing=${JSON.stringify(r.missing)} leaked=${JSON.stringify(r.leaked)} aboveCeiling=${JSON.stringify(r.aboveCeiling)} foreignToken=${r.foreignToken}`)
      .join("\n");
    expect(failed.length, `${results.length - failed.length} of ${results.length} pass; failing:\n${report}`).toBe(0);
    expect(results.filter((r) => r.pass)).toHaveLength(21);

    await setM365Search(company.id, false);
  });

  for (const flavor of ["cloud", "dc"] as const) {
    it(`syncs Jira ${flavor === "dc" ? "Data Center" : "Cloud"}: creates the epic, pulls a human's change, and exposes a work tracker`, async () => {
      // A company of its own per flavor: the sync's idempotency keys ("jira:NUP-2:status:10000") repeat between fakes.
      const jc = await db.company.create({
        data: { slug: `${SLUG}-${flavor}`, name: "CNX Z1 " + flavor, seedJson: toSeedJson(SEED) as object },
        select: { id: true, slug: true },
      });
      const token = "cnx-" + flavor + "-token";
      const jira = await startFakeJira({ flavor, token });
      try {
        const settings = {
          flavor,
          siteUrl: jira.url,
          email: flavor === "dc" ? "" : jira.email,
          projectKey: jira.projectKey,
          epicTypeId: EPIC_TYPE.id,
          stepTypeId: TASK_TYPE.id,
          autoEpic: true,
          pullNewIssues: true,
          pullComments: true,
        };
        await saveIntegration({
          companyId: jc.id,
          system: JIRA,
          settings,
          secretSealed: seal(token, Buffer.from(VAULT_KEY, "hex"), integrationContext(jc.id, JIRA)),
          account: null,
          updatedBy: "cnx-z1",
        });
        expect(await setIntegrationOn(jc.id, JIRA, true, "cnx-z1")).toBe(true);
        await new Promise((r) => setTimeout(r, 25)); // events must come after the switch-on

        const projectId = `p_${flavor}`;
        const caseId = `c_${flavor}`;
        const add = (type: string, id: string, target: string, payload: object, actor = "L. Brandt") =>
          db.caseEvent.create({ data: { id: `${id}_${jc.id}`, companyId: jc.id, day: 0, type, actor, targetId: target, payload } });
        await add("case.raised", `e_raise_${flavor}`, caseId, { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, "Anonymous #4471");
        await add("case.decided", `e_decide_${flavor}`, caseId, { answer: "yes", projectId, lead: "L. Brandt", title: "Shorter changeover" }, "T. Vogel");
        await add("project.step.added", `e_step_${flavor}`, projectId, { stepId: "s1", text: "Pre-stage the tools" });

        await syncCompany(jc);
        const epics = [...jira.issues.values()].filter((i) => i.labels.includes(`nextup-${projectId}`));
        expect(epics).toHaveLength(1);
        expect(epics[0].typeId).toBe(EPIC_TYPE.id);
        expect(epics[0].summary).toBe("Shorter changeover");
        const epic = epics[0];

        let log = await loadLog(jc.id);
        const linked = log.events.filter((e) => e.type === "project.linked");
        expect(linked.length).toBeGreaterThan(0);
        expect(linked.every((e) => e.actor === JIRA_ACTOR)).toBe(true);
        expect(linked.some((e) => e.payload.key === epic.key)).toBe(true);
        expect(await getIntegration(jc.id, JIRA)).toMatchObject({ on: true, lastError: null });

        // A human moves the step's issue and comments on the epic in Jira; the next round pulls both.
        const child = [...jira.issues.values()].find((i) => i.parentKey === epic.key);
        expect(child, "the step's issue is a child of the epic").toBeTruthy();
        await new Promise((r) => setTimeout(r, 1100)); // Jira stamps whole milliseconds; keep the change clearly after the cursor
        jira.human.move(child!.key, "In Progress");
        jira.human.comment(epic.key, "Parts arrive Friday.");
        const before = log.events.length;
        await syncCompany(jc, new Date());

        log = await loadLog(jc.id);
        const pulled = log.events.slice(before);
        expect(pulled.length).toBeGreaterThan(0);
        expect(pulled.every((e) => e.actor === JIRA_ACTOR)).toBe(true);
        expect(pulled.some((e) => e.type === "project.commented" && String(e.payload.text).includes("Parts arrive Friday."))).toBe(true);
        const state = reduce(await seedFor(jc.slug), log);
        const project = state.projects.find((p) => p.id === projectId);
        expect(project?.steps.find((s) => s.id === "s1")?.column).toBe("doing");

        const tracker = await workTrackerFor(jc.id);
        expect(tracker?.info.id).toBe(flavor === "dc" ? "jira-dc" : "jira-cloud");

      } finally {
        await jira.close();
        await db.company.delete({ where: { id: jc.id } });
        await setIntegrationOn(jc.id, JIRA, false, "cnx-z1").catch(() => undefined);
      }
    });
  }
});
