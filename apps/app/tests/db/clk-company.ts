// A sandbox or demo company for the clock scheduler tests (CLK-D1): its people, its structure and one raised case that is late.
// Shared by tests/db/clk-scheduler*.test.ts.
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { peopleForSeats } from "./test-company";
import { appendEventRow } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
export const now = new Date("2026-05-04T09:00:00+02:00");
export const earlier = new Date(now.getTime() - 14 * 86_400_000); // ten working days before now

export async function company(slug: string, stage: string, demoDay = 0) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug, name: slug, stage, demoDay, seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage });
  const routeId = seed.routes.find((r) => r.ownerSeatId)!.id;
  await appendEventRow(c.id, { id: `${slug}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: `${slug}-case`, payload: { title: "Late", routeId } } as never, { now: earlier });
  return c;
}

export const facts = (companyId: string, target: string) => db.caseEvent.findMany({ where: { companyId, type: "clock.due", targetId: target } });
