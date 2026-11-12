// Plan MOV, MOV-E1 (D23): the loop dispatcher plans notices for active people only, so a member who was deactivated hears
// nothing of a hand-over while an active one does. Against a real Postgres, on a sandbox company of its own.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CaseEventType } from "@/features/cases/events";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { dispatchOnce } from "@/server/notify/dispatch";

vi.mock("@/server/mail", async (orig) => ({ ...(await orig<typeof import("@/server/mail")>()), mailConfigured: () => true, sendMail: async () => ({ ok: true }) }));

const db = getDb();
const SLUG = "mov-dispatch";
let companyId = "";
const id: Record<"lead" | "next" | "active" | "gone" | "raiser", string> = { lead: "", next: "", active: "", gone: "", raiser: "" };

let seq = 0;
const append = async (type: CaseEventType, actorUserId: string | null, targetId: string, payload: Record<string, unknown>) => {
  const r = await appendEventRow(companyId, { id: `mov-${seq++}`, day: 0, type, actor: "x", targetId, payload }, { actorUserId });
  expect(r.ok).toBe(true);
};

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const c = await db.company.create({ data: { slug: SLUG, name: "MOV dispatch", seedJson: toSeedJson(SEED) as object } });
  companyId = c.id;
  const user = async (name: string, active = true) =>
    (await db.user.create({ data: { companyId, name, email: `${name.toLowerCase().replace(/\W+/g, ".")}@mov-dispatch.example`, role: "member", dept: "", ini: "XX", active } })).id;
  id.lead = await user("Lena Lead");
  id.next = await user("Nora New");
  id.active = await user("Max Active");
  id.gone = await user("Gus Gone", false);
  id.raiser = await user("Ria Raiser");
  // The history: an idea, its yes and a team of two, one of whom has since been deactivated.
  await append("case.raised", id.raiser, "c_a", { kind: "idea", title: "Idea", body: "text", routeId: SEED.routes[0].id, assignee: "T. Vogel" });
  await append("case.decided", id.lead, "c_a", { answer: "yes", projectId: "p_one", lead: "Lena Lead", leadUserId: id.lead, title: "Shorter changeover" });
  await append("project.member", id.lead, "p_one", { name: "Max Active", userId: id.active, on: true });
  await append("project.member", id.lead, "p_one", { name: "Gus Gone", userId: id.gone, on: true });
  await dispatchOnce(); // first run: the cursor starts at the newest event, history sends nothing
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("MOV dispatcher skips the deactivated", () => {
  it("plans a hand-over for the active member and the new lead, and nothing for the deactivated member", async () => {
    await append("project.handed", id.lead, "p_one", { to: "Nora New", toUserId: id.next, why: "Night shift" });
    expect((await dispatchOnce()).events).toBe(1);

    const rows = await db.outboxMessage.findMany({ where: { companyId, template: "loop.project.handed" }, select: { recipientUserId: true, channel: true, subject: true } });
    const who = (channel: string) => rows.filter((r) => r.channel === channel).map((r) => r.recipientUserId).sort();
    // Mail and the in-app copy: the new lead, the active member and the raiser; the old lead moved it and is not told.
    expect(who("mail")).toEqual([id.active, id.next, id.raiser].sort());
    expect(who("inapp")).toEqual([id.active, id.next, id.raiser].sort());
    expect(rows.some((r) => r.recipientUserId === id.gone)).toBe(false);
    expect(rows.find((r) => r.recipientUserId === id.next && r.channel === "mail")!.subject).toMatch(/^You lead P-\d+: Shorter changeover$/);
    expect(rows.find((r) => r.recipientUserId === id.active && r.channel === "mail")!.subject).toMatch(/^Nora New now leads P-\d+: Shorter changeover$/);
  });
});
