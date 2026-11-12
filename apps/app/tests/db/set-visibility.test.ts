// SET-F1 against a real Postgres: what actually leaves the server for each viewer of a draft (D13, D20). The CaseView reader
// says who may open the case; viewer-log cuts the draft's own events before they are serialised, so a viewer who may read the
// idea does not receive its steps, invitations or comments.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@/config/roles";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { peopleForSeats } from "./test-company";
import { appendEventRow } from "@/lib/db/events";
import { caseView } from "@/lib/db/projections/readers";
import { loadCaseFor, loadLogFor, type LogViewer } from "@/lib/db/viewer-log";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const now = new Date("2026-05-04T09:00:00+02:00");
const PEOPLE: [string, Role][] = [
  ["B. Hartmann", "manager"], ["T. Vogel", "leader"], ["J. Schmidt", "member"], ["K. Lead", "member"],
  ["O. Outsider", "member"], ["I. Invitee", "member"], ["D. Decliner", "member"], ["F. Follower", "member"],
];
let companyId: string;
let other: { companyId: string; userId: string };
let user: Record<string, string>;
const viewer = (name: string, role: Role = PEOPLE.find((p) => p[0] === name)![1]): LogViewer => ({ userId: user[name], role });

async function makeCompany(slug: string, names: [string, Role][]) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = ([name, role]: [string, Role]) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: names.map(person) } } });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  return c;
}

const SECRET = ["SECRET STEP", "SECRET COMMENT", "SECRET REASON"];
const everything = (events: { payload: unknown }[]) => JSON.stringify(events.map((e) => e.payload));

beforeAll(async () => {
  await db.company.deleteMany({});
  const c = await makeCompany("setv-box", PEOPLE);
  companyId = c.id;
  user = Object.fromEntries((await db.user.findMany({ where: { companyId } })).map((u) => [u.name, u.id]));
  const route = (await companySeed({ id: companyId, seedJson: c.seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
  const append = async (id: string, type: string, actor: string, targetId: string, payload: Record<string, unknown>) => {
    const r = await appendEventRow(companyId, { id, day: 0, type, actor, targetId, payload } as never, { actorUserId: user[actor], now });
    if (!r.ok) throw new Error(r.error);
  };
  // d: an open idea (everyone may read it) with a draft; q: a private idea with a draft.
  for (const [k, visibility] of [["d", "everyone"], ["q", "private"]] as const) {
    await append(`v-${k}-raised`, "case.raised", "J. Schmidt", `v-${k}-case`, { kind: "idea", title: `Idea ${k}`, routeId: route.id, visibility });
    await append(`v-${k}-yes`, "case.decided", "T. Vogel", `v-${k}-case`, { answer: "yes", projectId: `p_${k}`, lead: "K. Lead", leadUserId: user["K. Lead"], title: `Project ${k}`, draft: true });
    await append(`v-${k}-goal`, "project.goal", "K. Lead", `p_${k}`, { goal: "Faster changeover", doneWhen: "Under 30 minutes", brief: "Why and what." });
    await append(`v-${k}-step`, "project.step.added", "K. Lead", `p_${k}`, { text: "SECRET STEP" });
    await append(`v-${k}-comment`, "project.commented", "K. Lead", `p_${k}`, { text: "SECRET COMMENT" });
    await append(`v-${k}-moved`, "project.start.moved", "T. Vogel", `p_${k}`, { dueDay: 30, why: "SECRET REASON" });
  }
  await append("v-d-inv1", "project.invited", "K. Lead", "p_d", { userId: user["I. Invitee"], role: "contributor" });
  await append("v-d-fol", "project.invited", "K. Lead", "p_d", { userId: user["F. Follower"], role: "follower" });
  // e: an idea with no audience chosen, so only the invited get to open it besides the desk (keys, not "everyone").
  await append("v-e-raised", "case.raised", "J. Schmidt", "v-e-case", { kind: "idea", title: "Idea e", routeId: route.id });
  await append("v-e-yes", "case.decided", "T. Vogel", "v-e-case", { answer: "yes", projectId: "p_e", lead: "K. Lead", leadUserId: user["K. Lead"], title: "Project e", draft: true });
  await append("v-e-step", "project.step.added", "K. Lead", "p_e", { text: "SECRET STEP" });
  const o = await makeCompany("setv-other", [["X. Stranger", "manager"]]);
  other = { companyId: o.id, userId: (await db.user.findFirstOrThrow({ where: { companyId: o.id } })).id };
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

const projectEvents = async (v: LogViewer, project: string) => (await loadLogFor(companyId, v, now)).log.events.filter((e) => e.target === project);

describe("SET draft visibility", () => {
  it("a member who may open the case but is not on the draft gets the case without the project's steps, invitations or comments", async () => {
    expect(await caseView(companyId, "v-d-case")).toMatchObject({ caseId: "v-d-case" });
    const got = await loadCaseFor(companyId, viewer("O. Outsider"), "v-d-case");
    expect(got).not.toBeNull();
    expect(got!.events.some((e) => e.type === "case.decided")).toBe(true);
    for (const s of SECRET) expect(everything(got!.events), s).not.toContain(s);
    const log = await loadLogFor(companyId, viewer("O. Outsider"), now);
    expect(log.log.events.some((e) => e.target === "v-d-case")).toBe(true);
    const mine = await projectEvents(viewer("O. Outsider"), "p_d");
    // only what a line needs: who leads it and when it starts; no reasons, goal, steps, invitations, comments
    expect(mine.map((e) => e.type).sort()).toEqual(["project.start.moved"]);
    expect(mine[0].payload).toEqual({ dueDay: 30 });
    for (const s of [...SECRET, "Faster changeover", "Why and what.", "project.invited"]) expect(JSON.stringify(log.log.events), s).not.toContain(s);
  });

  it("the raiser, not on the draft, also gets the goal, done-when and brief, and still no steps, invitations or comments", async () => {
    const mine = await projectEvents(viewer("J. Schmidt"), "p_d");
    expect(mine.map((e) => e.type).sort()).toEqual(["project.goal", "project.start.moved"]);
    expect(mine.find((e) => e.type === "project.goal")!.payload).toEqual({ goal: "Faster changeover", doneWhen: "Under 30 minutes", brief: "Why and what." });
    const got = await loadCaseFor(companyId, viewer("J. Schmidt"), "v-d-case");
    for (const s of SECRET) expect(everything(got!.events), s).not.toContain(s);
  });

  it("an invited person gets the case once invited, with the draft itself; a follower too; the lead and the decider always", async () => {
    for (const name of ["I. Invitee", "F. Follower", "K. Lead", "T. Vogel"]) {
      expect(await loadCaseFor(companyId, viewer(name), "v-d-case"), name).not.toBeNull();
      const types = (await projectEvents(viewer(name), "p_d")).map((e) => e.type);
      expect(types, name).toEqual(expect.arrayContaining(["project.step.added", "project.commented"]));
    }
    // a case nobody opened it to: the invitation is what opens it, and it sees the draft
    const append = async (id: string, type: string, actor: string, payload: Record<string, unknown>, opts: { source?: string } = {}) => {
      const r = await appendEventRow(companyId, { id, day: 0, type, actor, targetId: "p_e", payload } as never, { actorUserId: actor === "system:clock" ? null : user[actor], now, ...opts });
      if (!r.ok) throw new Error(r.error);
    };
    expect(await loadCaseFor(companyId, viewer("I. Invitee"), "v-e-case")).toBeNull();
    await append("v-e-inv1", "project.invited", "K. Lead", { userId: user["I. Invitee"], role: "contributor" });
    await append("v-e-inv2", "project.invited", "K. Lead", { userId: user["D. Decliner"], role: "member" });
    for (const name of ["I. Invitee", "D. Decliner"]) {
      expect(await loadCaseFor(companyId, viewer(name), "v-e-case"), name).not.toBeNull();
      expect((await projectEvents(viewer(name), "p_e")).map((e) => e.type), name).toContain("project.step.added");
    }
    // not for anyone else who is no invitee
    expect(await loadCaseFor(companyId, viewer("O. Outsider"), "v-e-case")).toBeNull();
  });

  it("an invitation that is declined or has lapsed takes the case and the draft away again", async () => {
    const append = async (id: string, actor: string, payload: Record<string, unknown>, source = "app", target = "p_e") => {
      const r = await appendEventRow(companyId, { id, day: 0, type: "project.invite.answered", actor, targetId: target, payload } as never, { actorUserId: actor === "system:clock" ? null : user[actor], now, source });
      if (!r.ok) throw new Error(r.error);
    };
    await append("v-e-decline", "D. Decliner", { inviteId: "v-e-inv2", userId: user["D. Decliner"], take: false, reason: "SECRET REASON" });
    expect(await loadCaseFor(companyId, viewer("D. Decliner"), "v-e-case")).toBeNull();
    expect((await loadLogFor(companyId, viewer("D. Decliner"), now)).caseIds).not.toContain("v-e-case");
    expect(await projectEvents(viewer("D. Decliner"), "p_e")).toEqual([]);
    // the same for a lapse the clock wrote
    await append("v-e-lapse", "system:clock", { inviteId: "v-e-inv1", userId: user["I. Invitee"], take: false, lapsed: true }, "clock");
    expect(await loadCaseFor(companyId, viewer("I. Invitee"), "v-e-case")).toBeNull();
    expect(await projectEvents(viewer("I. Invitee"), "p_e")).toEqual([]);
    // on the open idea the same person still reads the idea (it is open to everyone) but gets no more of the draft
    await append("v-d-lapse", "system:clock", { inviteId: "v-d-inv1", userId: user["I. Invitee"], take: false, lapsed: true }, "clock", "p_d");
    expect(await loadCaseFor(companyId, viewer("I. Invitee"), "v-d-case")).not.toBeNull();
    expect((await projectEvents(viewer("I. Invitee"), "p_d")).map((e) => e.type)).toEqual(["project.start.moved"]);
  });

  it("a manager sees the draft unless the idea is private; a private idea's draft stays with the people on it", async () => {
    expect((await projectEvents(viewer("B. Hartmann"), "p_d")).map((e) => e.type)).toContain("project.step.added");
    // the private idea: the manager may not open the case, so nothing of it leaves
    expect(await loadCaseFor(companyId, viewer("B. Hartmann"), "v-q-case")).toBeNull();
    expect(await projectEvents(viewer("B. Hartmann"), "p_q")).toEqual([]);
    expect(await projectEvents(viewer("O. Outsider"), "p_q")).toEqual([]);
    expect(await loadCaseFor(companyId, viewer("K. Lead"), "v-q-case")).not.toBeNull();
    expect((await projectEvents(viewer("K. Lead"), "p_q")).map((e) => e.type)).toContain("project.step.added");
  });

  it("the holder of the seat a late draft was given to reads it like the people on it, until the escalation ends (D22)", async () => {
    const route = (await companySeed({ id: companyId, seedJson: (await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { seedJson: true } })).seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
    const append = async (id: string, type: string, actor: string, actorUserId: string | null, targetId: string, payload: Record<string, unknown>, source = "app") => {
      const r = await appendEventRow(companyId, { id, day: 0, type, actor, targetId, payload } as never, { actorUserId, now, source });
      if (!r.ok) throw new Error(r.error);
    };
    await append("v-x-raised", "case.raised", "J. Schmidt", user["J. Schmidt"], "v-x-case", { kind: "idea", title: "Idea x", routeId: route.id, visibility: "everyone" });
    // The decider leads it himself, so it is taken at the yes and has a start day.
    await append("v-x-yes", "case.decided", "T. Vogel", user["T. Vogel"], "v-x-case", { answer: "yes", projectId: "p_x", lead: "T. Vogel", leadUserId: user["T. Vogel"], title: "Project x", draft: true });
    await append("v-x-step", "project.step.added", "T. Vogel", user["T. Vogel"], "p_x", { text: "SECRET STEP" });
    const seat = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
    const holder: LogViewer = { userId: user["M. Roth"], role: "leader" };
    // Before the clock gave it away the seat's holder is a reader like any other.
    expect(await projectEvents(holder, "p_x")).toEqual([]);
    await append("v-x-late", "clock.due", "system:clock", null, "p_x", { kind: "draft", dueDay: 1, toRoleHolderId: seat.id }, "clock");
    expect((await projectEvents(holder, "p_x")).map((e) => e.type), "the seat the draft went to").toEqual(expect.arrayContaining(["project.step.added"]));
    // Someone else, with no seat of the draft's, still reads no more than the line.
    expect((await projectEvents(viewer("O. Outsider"), "p_x")).map((e) => e.type)).not.toContain("project.step.added");
    const got = await loadCaseFor(companyId, holder, "v-x-case");
    expect(everything(got!.events)).toContain("SECRET STEP");
    // The holder keeps it with a new date: the escalation ends and so does the access.
    await append("v-x-moved", "project.start.moved", "M. Roth", user["M. Roth"], "p_x", { dueDay: 30, why: "SECRET REASON" });
    expect((await projectEvents(holder, "p_x")).map((e) => e.type)).toEqual(["project.start.moved"]);
    expect(everything((await loadCaseFor(companyId, holder, "v-x-case"))!.events)).not.toContain("SECRET");
  });

  it("the desk's line to the raiser reaches the raiser and the people on the draft, and nobody else who reads the case (D23)", async () => {
    const append = async (id: string, type: string, actor: string, targetId: string, payload: Record<string, unknown>) => {
      const r = await appendEventRow(companyId, { id, day: 0, type, actor, targetId, payload } as never, { actorUserId: user[actor], now });
      if (!r.ok) throw new Error(r.error);
    };
    const route = (await companySeed({ id: companyId, seedJson: (await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { seedJson: true } })).seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
    await append("v-n-raised", "case.raised", "J. Schmidt", "v-n-case", { kind: "idea", title: "Idea n", routeId: route.id, visibility: "everyone" });
    await append("v-n-yes", "case.decided", "T. Vogel", "v-n-case", { answer: "yes", projectId: "p_n", lead: "K. Lead", leadUserId: user["K. Lead"], title: "Project n", draft: true, raiserNote: "NOTE FOR THE RAISER" });
    await append("v-n-inv", "project.invited", "K. Lead", "p_n", { userId: user["I. Invitee"], role: "contributor" });
    await append("v-n-fol", "project.invited", "K. Lead", "p_n", { userId: user["F. Follower"], role: "follower" });
    const noteOf = async (name: string) => {
      const got = await loadCaseFor(companyId, viewer(name), "v-n-case");
      expect(got, `${name} reads the case`).not.toBeNull();
      const decided = got!.events.find((e) => e.type === "case.decided");
      expect(decided, `${name} gets the yes`).toBeDefined();
      // The same in the whole log the page is built from.
      const inLog = (await loadLogFor(companyId, viewer(name), now)).log.events.find((e) => e.id === "v-n-yes");
      expect(JSON.stringify(inLog?.payload), name).toBe(JSON.stringify(decided!.payload));
      return (decided!.payload as { raiserNote?: string }).raiserNote;
    };
    for (const name of ["J. Schmidt", "T. Vogel", "K. Lead", "I. Invitee", "F. Follower", "B. Hartmann"]) expect(await noteOf(name), name).toBe("NOTE FOR THE RAISER");
    for (const name of ["O. Outsider", "D. Decliner"]) {
      expect(await noteOf(name), name).toBeUndefined();
      expect(JSON.stringify((await loadCaseFor(companyId, viewer(name), "v-n-case"))!.events), name).not.toContain("NOTE FOR THE RAISER");
      // Everything else of the yes stays: the answer, the project and its lead.
      expect((await loadCaseFor(companyId, viewer(name), "v-n-case"))!.events.find((e) => e.type === "case.decided")!.payload).toMatchObject({ answer: "yes", projectId: "p_n", draft: true });
    }
  });

  it("another company's viewer gets nothing of it", async () => {
    const v: LogViewer = { userId: other.userId, role: "manager" };
    expect(await loadCaseFor(other.companyId, v, "v-d-case")).toBeNull();
    const log = await loadLogFor(other.companyId, v, now);
    expect(JSON.stringify(log.log.events)).not.toContain("SECRET");
  });
});
