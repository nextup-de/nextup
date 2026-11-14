import { expect, it } from "vitest";
import type { Actor } from "@/features/cases/permissions";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_PAGES, EVENT_BUDGET, kicksJira, pagesOf } from "@/features/projects/pages";
import { mayAppendProject } from "@/features/projects/permissions";
import { newBook, seedProject } from "@/features/projects/reduce";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import { translate, type MessageKey } from "@/i18n";

const actor = (userId = "lead", role: Actor["role"] = "member"): Actor => ({ userId, role, name: "Same label", handle: null });
const doc = (id: string): ToolInstance => ({ id, kind: "doc", title: null, content: null, collapsed: false, rev: 0 });
const page = (id: string, count = 0): ProjectPage => ({ id, title: id, icon: "doc", tools: Array.from({ length: count }, (_, i) => doc(`${id}-${i}`)) });
const added: EventPayload = { pageId: "notes", title: "Notes", icon: "doc", tools: [{ toolId: "notes-doc", kind: "doc" }] };
function setup() {
  const book = newBook();
  seedProject(book, { id: "p", title: "Pilot", sources: [], authors: [], lead: "Lead", leadUserId: "lead", memberUserIds: ["member"], openedDay: 0, openedBy: "Lead" });
  const p = book.byId.p;
  p.followerUserIds = ["follower"];
  const state = { projects: [p], day: 0, seats: [] } as unknown as State;
  const ask = (type: string, payload: EventPayload = {}, who = actor()) => mayAppendProject(who, { type, payload, target: p.id }, state);
  const refused = (type: string, payload: EventPayload, key: MessageKey, who = actor()) => expect(ask(type, payload, who)).toEqual({ ok: false, error: translate("en", key) });
  return { p, state, ask, refused };
}

it("PGE page rights: lead, member and manager can append all twelve events; followers and strangers cannot", () => {
  const { p, ask, refused } = setup();
  p.pages = [...pagesOf(p, { agent: true }), page("notes", 1)];
  p.removed = [{ page: page("removed"), tool: null, pageId: "removed", before: null, day: 0 }, { page: null, tool: doc("removed-doc"), pageId: "notes", before: null, day: 0 }];
  p.merges.undo = { from: { id: "merged", title: "Merged", icon: "doc", before: null }, toolIds: [] };
  const events: [string, EventPayload][] = [
    ["project.page.added", { ...added, pageId: "new", tools: [] }],
    ["project.page.edited", { pageId: "notes", title: "New title" }],
    ["project.page.moved", { pageId: "notes", before: null }],
    ["project.page.removed", { pageId: "notes" }],
    ["project.page.restored", { pageId: "removed" }],
    ["project.tool.added", { pageId: "notes", toolId: "new-doc", kind: "doc" }],
    ["project.tool.moved", { toolId: "notes-0", toPageId: "steps" }],
    ["project.tool.edited", { toolId: "notes-0", content: "Saved", baseRev: 0 }],
    ["project.tool.removed", { toolId: "notes-0" }],
    ["project.tool.restored", { toolId: "removed-doc" }],
    ["project.page.merged", { mergeId: "new-merge", fromPageId: "notes", intoPageId: "steps" }],
    ["project.page.unmerged", { mergeId: "undo" }],
  ];
  for (const [type, payload] of events) {
    for (const who of [actor(), actor("member"), actor("manager", "manager")]) expect(ask(type, payload, who), type).toEqual({ ok: true });
    for (const who of [actor("follower"), actor("stranger"), actor("")]) refused(type, payload, "projectPages.permPageWho", who);
    for (const status of ["stopped", "recognised"] as const) {
      p.status = status;
      refused(type, payload, "projectPages.permPageClosed");
    }
    p.status = "planning";
    refused(type, { ...payload, text: "x".repeat(EVENT_BUDGET) }, "projectPages.permEventTooLong");
  }
});

it("PGE page rights: validates titles, icons, tool kinds, ids and references using projectPages keys", () => {
  const { ask, refused } = setup();
  for (const title of ["", " ", "x".repeat(61)]) {
    refused("project.page.added", { ...added, title }, "projectPages.permPageTitle");
    refused("project.page.edited", { pageId: "steps", title }, "projectPages.permPageTitle");
    refused("project.tool.edited", { toolId: "steps.list", title }, "projectPages.permPageTitle");
  }
  for (const title of ["x", "x".repeat(60)]) expect(ask("project.page.added", { ...added, title }).ok).toBe(true);
  refused("project.page.added", { ...added, icon: "wrong" } as unknown as EventPayload, "projectPages.permPageIcon");
  refused("project.page.edited", { pageId: "steps", icon: "wrong" } as unknown as EventPayload, "projectPages.permPageIcon");
  refused("project.tool.added", { pageId: "steps", toolId: "new", kind: "wrong" } as unknown as EventPayload, "projectPages.permToolKind");
  refused("project.page.added", { ...added, tools: [null] } as unknown as EventPayload, "projectPages.permToolKind");
  refused("project.page.added", { ...added, tools: [{ toolId: "new", kind: "wrong" }] } as unknown as EventPayload, "projectPages.permToolKind");
  refused("project.page.added", { ...added, pageId: "" }, "projectPages.permPageUnknown");
  refused("project.tool.added", { pageId: "steps", toolId: "", kind: "doc" }, "projectPages.permToolUnknown");
  for (const type of ["edited", "moved", "removed", "restored"]) {
    refused(`project.page.${type}`, { pageId: "missing", before: null }, "projectPages.permPageUnknown");
    refused(`project.tool.${type}`, { toolId: "missing", toPageId: "steps" }, "projectPages.permToolUnknown");
  }
  refused("project.tool.added", { pageId: "missing", toolId: "new", kind: "doc" }, "projectPages.permPageUnknown");
  refused("project.tool.moved", { toolId: "steps.list", toPageId: "missing" }, "projectPages.permPageUnknown");
  refused("project.page.moved", { pageId: "steps", before: "missing" }, "projectPages.permPageUnknown");
  refused("project.tool.moved", { toolId: "steps.list", toPageId: "files", before: "missing" }, "projectPages.permToolUnknown");
  refused("project.page.merged", { mergeId: "m", fromPageId: "missing", intoPageId: "steps" }, "projectPages.permPageUnknown");
  refused("project.page.merged", { mergeId: "m", fromPageId: "steps", intoPageId: "steps" }, "projectPages.permPageUnknown");
  refused("project.page.unmerged", { mergeId: "missing" }, "projectPages.permMergeUnknown");
  refused("project.tool.edited", { toolId: "steps.list", collapsed: "yes" } as unknown as EventPayload, "projectPages.permToolUnknown");
});

it("PGE page rights: counts defaults, rejects existing ids and keeps single kinds unique", () => {
  const { p, refused, ask } = setup();
  refused("project.page.added", { ...added, pageId: "steps" }, "projectPages.permPageExists");
  refused("project.tool.added", { pageId: "steps", toolId: "steps.list", kind: "list" }, "projectPages.permPageExists");
  for (const kind of ["overview", "agent"] as const) {
    refused("project.tool.added", { pageId: "steps", toolId: "new", kind }, "projectPages.permToolOnce");
    refused("project.page.added", { ...added, tools: [{ toolId: "new", kind }] }, "projectPages.permToolOnce");
  }
  expect(ask("project.tool.added", { pageId: "steps", toolId: "new", kind: "list" }).ok).toBe(true);
  refused("project.page.added", { ...added, tools: [{ toolId: "new", kind: "doc" }, { toolId: "new", kind: "table" }] }, "projectPages.permPageExists");
  p.pages = [...pagesOf(p, { agent: true }), page("notes")];
  refused("project.page.added", added, "projectPages.permPageExists");
  p.removed = [{ page: page("gone", 1), tool: null, pageId: "gone", day: 0, before: null }];
  refused("project.page.added", { ...added, pageId: "gone" }, "projectPages.permPageExists");
  refused("project.tool.added", { pageId: "steps", toolId: "gone-0", kind: "doc" }, "projectPages.permPageExists");
  p.pages = p.pages.filter((x) => x.id !== "agent");
  refused("project.page.added", { ...added, tools: [{ toolId: "a1", kind: "agent" }, { toolId: "a2", kind: "agent" }] }, "projectPages.permToolOnce");
});

it("PGE page rights: refuses overflowing adds, moves, restores, merges and unmerges and protects overview and the last page", () => {
  const { p, ask, refused } = setup();
  p.pages = Array.from({ length: 24 }, (_, i) => page(`p${i}`));
  p.removed = [{ page: page("gone"), tool: null, pageId: "gone", before: null, day: 0 }];
  p.merges.undo = { from: { id: "merged", title: "Merged", icon: "doc", before: null }, toolIds: [] };
  refused("project.page.added", added, "projectPages.permPageLimit");
  refused("project.page.restored", { pageId: "gone" }, "projectPages.permPageLimit");
  refused("project.page.unmerged", { mergeId: "undo" }, "projectPages.permPageLimit");
  p.pages = [page("full", 24), page("other", 1)];
  refused("project.tool.added", { pageId: "full", toolId: "new", kind: "doc" }, "projectPages.permPageLimit");
  refused("project.tool.moved", { toolId: "other-0", toPageId: "full" }, "projectPages.permPageLimit");
  expect(ask("project.tool.moved", { toolId: "full-0", toPageId: "full", before: null }).ok).toBe(true);
  refused("project.page.added", { ...added, tools: Array.from({ length: 25 }, (_, i) => ({ toolId: `t${i}`, kind: "doc" })) }, "projectPages.permPageLimit");
  refused("project.page.merged", { mergeId: "m", fromPageId: "other", intoPageId: "full" }, "projectPages.permPageLimit");
  p.removed = [{ page: null, tool: doc("gone-tool"), pageId: "full", before: null, day: 0 }];
  refused("project.tool.restored", { toolId: "gone-tool" }, "projectPages.permPageLimit");
  p.pages = pagesOf({ pages: null }, { agent: true });
  refused("project.page.removed", { pageId: "overview" }, "projectPages.permPageOverview");
  refused("project.page.merged", { mergeId: "m", fromPageId: "overview", intoPageId: "steps" }, "projectPages.permPageOverview");
  p.pages = [page("last")];
  refused("project.page.removed", { pageId: "last" }, "projectPages.permPageLast");
});

it("PGE page rights: accepts a 12000-character whole content event and refuses one more or a stale revision", () => {
  const { ask, refused } = setup();
  const payload = { toolId: "steps.list", content: "", baseRev: 0 };
  payload.content = "x".repeat(EVENT_BUDGET - JSON.stringify(payload).length);
  expect(JSON.stringify(payload)).toHaveLength(12000);
  expect(ask("project.tool.edited", payload)).toEqual({ ok: true });
  refused("project.tool.edited", { ...payload, content: payload.content + "x" }, "projectPages.permEventTooLong");
  for (const baseRev of [undefined, -1, 1]) refused("project.tool.edited", { toolId: "steps.list", content: "Saved", baseRev }, "projectPages.permToolStale");
  expect(ask("project.tool.edited", { toolId: "steps.list", title: "Tasks", collapsed: true }).ok).toBe(true);
});

it("PGE page rights: members without Agent-tab rights cannot relocate, add, remove or restore Agent tools or their pages", () => {
  const { p, ask, refused } = setup();
  const member = actor("member");
  for (const [type, payload] of [
    ["project.tool.added", { pageId: "steps", toolId: "new", kind: "agent" }],
    ["project.page.added", { ...added, tools: [{ toolId: "new", kind: "agent" }] }],
    ["project.tool.moved", { toolId: "agent.agent", toPageId: "steps" }],
    ["project.tool.removed", { toolId: "agent.agent" }],
    ["project.page.moved", { pageId: "agent", before: null }],
    ["project.page.removed", { pageId: "agent" }],
    ["project.page.merged", { mergeId: "m", fromPageId: "agent", intoPageId: "steps" }],
  ] as [string, EventPayload][]) refused(type, payload, "projectPages.permToolAgent", member);
  p.pages = pagesOf(p, { agent: true });
  const agentPage = p.pages.pop()!;
  p.removed = [{ page: agentPage, tool: null, pageId: "agent", before: null, day: 0 }];
  refused("project.page.restored", { pageId: "agent" }, "projectPages.permToolAgent", member);
  p.removed = [{ page: null, tool: agentPage.tools[0], pageId: "steps", before: null, day: 0 }];
  refused("project.tool.restored", { toolId: "agent.agent" }, "projectPages.permToolAgent", member);
  p.pages[1].tools.push(agentPage.tools[0]);
  p.merges.undo = { from: { id: "agent", title: "Agent", icon: "chat", before: null }, toolIds: ["agent.agent"] };
  refused("project.page.unmerged", { mergeId: "undo" }, "projectPages.permToolAgent", member);
  p.sponsorUserId = "member";
  expect(ask("project.tool.moved", { toolId: "agent.agent", toPageId: "files" }, member).ok).toBe(true);
});

it("PGE page rights: restore uses the 30-day company calendar and checks single kinds", () => {
  const { p, state, ask, refused } = setup();
  p.removed = [{ page: null, tool: { ...doc("old-agent"), kind: "agent" }, pageId: "steps", before: null, day: 0 }, { page: page("gone"), tool: null, pageId: "gone", before: null, day: 0 }];
  refused("project.tool.restored", { toolId: "old-agent" }, "projectPages.permToolOnce");
  state.day = 30;
  expect(ask("project.page.restored", { pageId: "gone" }).ok).toBe(true);
  state.day = 31;
  refused("project.page.restored", { pageId: "gone" }, "projectPages.permPageUnknown");
  refused("project.tool.restored", { toolId: "old-agent" }, "projectPages.permToolUnknown");
});

it("PGE page rights: kicksJira keeps page and tool changes local while case decisions and project work sync", () => {
  const condition = (type: string) => kicksJira(type) || type === "case.decided";
  for (const type of ["project.page.added", "project.tool.edited", "project.milestone.added", "project.form.added", "case.commented"]) expect(condition(type)).toBe(false);
  for (const type of ["project.step.added", "project.request.stepped", "project.sync", "case.decided"]) expect(condition(type)).toBe(true);
  expect(DEFAULT_PAGES).toHaveLength(9);
});
