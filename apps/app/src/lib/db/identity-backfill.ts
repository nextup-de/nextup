// One-off backfill (IDN-M1, D9/D12): binds the companies stored before IDN to user and seat ids.
// Per company: the seats and the stored seed (bindDemoCompany), then the actorUserId column and the
// payload id fields of its events. Matching is userByLabel / seatByLabel only; no label, type, day,
// seq or targetId is touched, and a set id is never overwritten. A second run writes nothing.
// Every query names the company at the top level, so the tenant guard sees it.
import type { EventPayload } from "@/features/cases/events";
import { seatByLabel, userByLabel, type DemoUser } from "@/features/demo/identity";
import type { SeatRow } from "@/features/auth/identity";
import { getDb } from "./client";
import { bindDemoCompany } from "./demo-identity";
import { loadSeats } from "./holders";

type Row = { id: string; type: string; actor: string; actorUserId: string | null; payload: unknown };

const isPayload = (p: unknown): p is EventPayload => typeof p === "object" && p !== null && !Array.isArray(p);

/** The id fields the payload lacks and its labels name; empty when there is nothing to add. */
function payloadIds(type: string, p: EventPayload, users: readonly DemoUser[], seats: readonly SeatRow[]): EventPayload {
  const ids: EventPayload = {};
  const user = (label: unknown) => (typeof label === "string" ? userByLabel(users, label) : null);
  const seat = (label: unknown) => (typeof label === "string" ? seatByLabel(seats, label) : null);
  const set = <K extends keyof EventPayload>(key: K, value: EventPayload[K] | null) => {
    if (p[key] === undefined && value !== null) ids[key] = value as EventPayload[K];
  };
  switch (type) {
    case "case.raised": set("assigneeRoleHolderId", seat(p.assignee)); break;
    case "case.handed": set("toRoleHolderId", seat(p.to)); break;
    case "case.discussion":
    case "case.invited": {
      const found = Array.isArray(p.invited) ? p.invited.flatMap((l) => { const id = user(l); return id === null ? [] : [id]; }) : [];
      set("invitedUserIds", found.length > 0 ? found : null);
      break;
    }
    case "case.decided": set("leadUserId", user(p.lead)); break;
    case "project.member": set("userId", user(p.name)); break;
    case "project.handed": set("toUserId", user(p.to)); break;
    case "project.step.added":
    case "project.step.edited": set("ownerUserId", user(p.owner)); break;
  }
  return ids;
}

/**
 * For every company: bind its seats and seed, then set actorUserId and the payload ids of its events
 * where they are absent and the label finds exactly one user (or the first seat). One line per company.
 */
export async function backfillIdentity(): Promise<{ slug: string; line: string }[]> {
  const db = getDb();
  const companies = await db.company.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  const out: { slug: string; line: string }[] = [];
  for (const company of companies) {
    const companyId = company.id;
    const { seatsLinked, seedBound } = await bindDemoCompany(companyId);
    const users: DemoUser[] = await db.user.findMany({ where: { companyId }, select: { id: true, name: true, handle: true } });
    const seats = await loadSeats(companyId);
    const rows: Row[] = await db.caseEvent.findMany({
      where: { companyId },
      orderBy: { seq: "asc" },
      select: { id: true, type: true, actor: true, actorUserId: true, payload: true },
    });

    let events = 0;
    for (const r of rows) {
      const actorUserId = r.actorUserId === null && !r.actor.startsWith("system:") ? userByLabel(users, r.actor) : null;
      const ids = isPayload(r.payload) ? payloadIds(r.type, r.payload, users, seats) : {};
      const payloadChanged = Object.keys(ids).length > 0;
      if (actorUserId === null && !payloadChanged) continue;
      await db.caseEvent.update({
        where: { id: r.id, companyId },
        data: {
          ...(actorUserId !== null ? { actorUserId } : {}),
          ...(payloadChanged ? { payload: { ...(r.payload as EventPayload), ...ids } as object } : {}),
        },
      });
      events++;
    }

    const changed = events > 0 || seatsLinked > 0 || seedBound;
    out.push({
      slug: company.slug,
      line: changed ? `${company.slug}: ${events} events, ${seatsLinked} seats linked, ${seedBound ? "seed bound" : "seed as it was"}` : `${company.slug}: left as it is`,
    });
  }
  return out;
}
