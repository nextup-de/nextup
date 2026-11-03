// Demo binding: the ONE place a display label meets an id (IDN/D9, docs/IDENTITY.md).
// Demo content (the built-in seed, the static demo, a demo company's stored seed) names people by
// label in its cases, history, projects and personas. bindDemoIds() fills the optional id fields
// next to those labels, so every domain function after it compares ids only (IDN/D2).
//
// Who may call this file: itself, src/lib/db/demo-identity.ts and src/lib/db/identity-backfill.ts.
// Nothing else matches a label to an id - not a page, not a reducer, not a selector.
// Pure: no Prisma, no React. It never changes a label and never overwrites an id that is set.
import type { SeatRow } from "@/features/auth/identity";
import type { SeedEvent } from "@/features/cases/events";
import { rowsFromSeed, structureSeed } from "@/features/knowledge";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import type { SeedProject } from "@/features/projects/types";
import type { Seed, SeedCase } from "./types";

export type DemoUser = { id: string; name: string; handle: string | null };

/** The id of the ONE user whose name or handle equals the trimmed label; null when none or several. */
export function userByLabel(users: readonly DemoUser[], label: string): string | null {
  const l = label.trim();
  if (!l) return null;
  const hits = users.filter((u) => u.name === l || u.handle === l);
  return hits.length === 1 ? hits[0].id : null;
}

/** The first seat by sort whose label equals the trimmed label; null when none. */
export function seatByLabel(seats: readonly SeatRow[], label: string): string | null {
  const l = label.trim();
  if (!l) return null;
  return [...seats].sort((a, b) => a.sort - b.sort).find((s) => s.label === l)?.id ?? null;
}

/** Fills only the optional id fields of IDN/D5 and D7. Labels stay; a set id stays. */
export function bindDemoIds(seed: Seed, seats: readonly SeatRow[], users: readonly DemoUser[]): Seed {
  const user = (label: string) => userByLabel(users, label);
  const userIds = (labels: readonly string[]) => labels.flatMap((l) => { const id = user(l); return id === null ? [] : [id]; });

  const event = (e: SeedEvent): SeedEvent => {
    const p = e.payload;
    const ids: NonNullable<SeedEvent["payload"]> = {};
    if (p) {
      if (e.type === "case.handed" && p.to !== undefined) ids.toRoleHolderId = p.toRoleHolderId ?? seatByLabel(seats, p.to);
      if ((e.type === "case.discussion" || e.type === "case.invited") && p.invited) ids.invitedUserIds = p.invitedUserIds ?? userIds(p.invited);
      if (e.type === "case.decided" && p.lead !== undefined) ids.leadUserId = p.leadUserId ?? user(p.lead);
      if (e.type === "project.member" && p.name !== undefined) ids.userId = p.userId ?? user(p.name);
      if (e.type === "project.handed" && p.to !== undefined) ids.toUserId = p.toUserId ?? user(p.to);
    }
    return { ...e, actorUserId: e.actorUserId ?? user(e.actor), ...(p ? { payload: { ...p, ...ids } } : {}) };
  };
  const events = (es: SeedEvent[] | undefined) => (es ? es.map(event) : es);

  const bindCase = (c: SeedCase): SeedCase => ({
    ...c,
    fromUserId: c.fromUserId ?? user(c.from),
    assigneeRoleHolderId: c.assigneeRoleHolderId ?? seatByLabel(seats, c.assignee),
    ...(c.seedEvents ? { seedEvents: events(c.seedEvents) } : {}),
  });
  const bindProject = (p: SeedProject): SeedProject => ({
    ...p,
    leadUserId: p.leadUserId ?? user(p.lead),
    memberUserIds: p.memberUserIds ?? userIds(p.members ?? []),
    authorUserIds: p.authorUserIds ?? userIds(p.authors),
    ...(p.seedEvents ? { seedEvents: events(p.seedEvents) } : {}),
  });

  return {
    ...seed,
    cases: seed.cases.map(bindCase),
    ideas: seed.ideas.map((i) => (i.seedEvents ? { ...i, seedEvents: events(i.seedEvents) } : i)),
    ...(seed.projects ? { projects: seed.projects.map(bindProject) } : {}),
    personas: seed.personas.map((r) => ({ ...r, who: { ...r.who, userId: r.who.userId ?? user(r.who.name) } })),
  };
}

/**
 * The seed for a build with no database (IDN/D10): its structure as rows with ids "local-1", ...,
 * one user per distinct holder label (`demo-u-<n>`) and per persona who holds no seat, every holder
 * linked to its label's user, then the content bound to those ids. Deterministic.
 */
export function localDemoSeed(raw: Seed): Seed {
  let n = 0;
  const knowledge = rowsFromSeed(raw, raw.goals, () => "local-" + ++n);
  const handleOf = (name: string) => raw.personas.find((r) => r.who.name === name)?.who.handle ?? null;

  const users: DemoUser[] = [];
  for (const h of [...knowledge.holders].sort((a, b) => a.sort - b.sort)) {
    if (!users.some((u) => u.name === h.name)) users.push({ id: "demo-u-" + (users.length + 1), name: h.name, handle: handleOf(h.name) });
  }
  for (const r of raw.personas) {
    if (!users.some((u) => u.name === r.who.name)) users.push({ id: "demo-u-" + (users.length + 1), name: r.who.name, handle: r.who.handle });
  }

  const holders = knowledge.holders.map((h) => ({ ...h, userId: users.find((u) => u.name === h.name)?.id ?? null }));
  const structured = structureSeed(raw, { ...knowledge, holders }, { ...DEFAULT_RULES, promiseDays: raw.promiseDays, outcomeDays: raw.outcomeDays, spend: raw.spend });
  return bindDemoIds(structured, structured.seats, users);
}
