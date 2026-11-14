// The demo's project acts (plan REG, decision D14): each one event as the current persona. A phase that adds a project
// act adds it here, never to DemoProvider.tsx.
import { newId, type EventPayload } from "@/features/cases/events";
import { stopChoice, type StopPick } from "@/features/projects/stop-choice";
import type { AppendOutcome } from "@/server/actions/events";
import type { InviteRole, PageIconKey, StepColumn, SyncSystem, ToolKind } from "@/features/projects/types";
import { DEMO_JIRA_KEY, DEMO_JIRA_SITE } from "@/features/projects/views";
import type { TemplateKey } from "@/features/templates/library";
import type { ActDeps } from "./act-deps";

/** A change to a step: only the fields given change. owner "" and dueDay null clear them; removed takes it off the board. */
export type StepChange = { text?: string; owner?: string; ownerUserId?: string | null; dueDay?: number | null; note?: string; removed?: boolean };

export type BaselineInput = { metric: string; unit: string; value: number; better: "up" | "down"; source: string } | { none: true; why: string };

// Everything done to a project, each one event (features/projects). Ids are minted here when the caller needs them back.
export type PageInput = { title: string; icon: PageIconKey; tools: { kind: ToolKind; title?: string; content?: string }[]; before?: string | null };
export type PageChange = { title?: string; icon?: PageIconKey };
export type ToolChange = { title?: string; collapsed?: boolean; content?: string; baseRev?: number };

export type ProjectAct = {
  page: {
    add: (projectId: string, input: PageInput) => string;
    edit: (projectId: string, pageId: string, change: PageChange) => void;
    move: (projectId: string, pageId: string, before: string | null) => void;
    remove: (projectId: string, pageId: string) => void;
    restore: (projectId: string, pageId: string) => void;
    addTool: (projectId: string, pageId: string, kind: ToolKind, before?: string | null) => string;
    moveTool: (projectId: string, toolId: string, toPageId: string, before?: string | null) => void;
    editTool: (projectId: string, toolId: string, change: ToolChange) => void;
    removeTool: (projectId: string, toolId: string) => void;
    restoreTool: (projectId: string, toolId: string) => void;
    merge: (projectId: string, fromPageId: string, intoPageId: string) => string;
    unmerge: (projectId: string, mergeId: string) => void;
  };
  /** Team changes name the person by user id; the label rides along for the timeline. */
  member: (projectId: string, who: { userId: string; name: string }, on: boolean) => void;
  hand: (projectId: string, to: { userId: string; name: string }, why?: string) => void;
  baseline: (projectId: string, b: BaselineInput) => void;
  start: (projectId: string) => void;
  addStep: (projectId: string, text: string, owner?: string, dueDay?: number, to?: StepColumn, note?: string, ownerUserId?: string | null) => string;
  /** before: the card it lands above; null puts it at the bottom of the column. */
  moveStep: (projectId: string, stepId: string, to: StepColumn, why?: string, before?: string | null) => void;
  editStep: (projectId: string, stepId: string, change: StepChange) => void;
  link: (projectId: string, url: string, system?: string, key?: string, stepId?: string) => void;
  /**
   * Send the project to a tool, or stop syncing (project.sync). Server mode: the connector does the rest.
   * The local demo has no Jira: it plays the connector itself, with the same project.linked events and no network.
   */
  sync: (projectId: string, on: boolean, system?: SyncSystem) => void;
  comment: (projectId: string, text: string) => void;
  /** `open`: how each step not in Done ends on the Done sheet (D13): finished or dropped with a reason. */
  done: (projectId: string, note?: string, open?: NonNullable<EventPayload["openSteps"]>) => void;
  measure: (projectId: string, check: number, value: number, source: string, note?: string) => void;
  reward: (projectId: string, rule: string, amount?: number, note?: string) => void;
  claim: (projectId: string) => void;
  stop: (projectId: string, why: string) => void;
  // The project draft (plan SET): each one event, appended through the same path as the others.
  /** The lead takes the draft, or declines it with the reason (D11). */
  answerLead: (projectId: string, take: boolean, reason?: string) => void;
  /** Seeds the board from that exact template version; `title` renames the project (D16). */
  pickTemplate: (projectId: string, key: TemplateKey, version: number, title?: string) => void;
  /** The lead or a manager invites a person by user id and role (D12). */
  invite: (projectId: string, userId: string, role: InviteRole) => void;
  /** The invitee takes or declines their own invitation; `inviteId` is the project.invited event. */
  answerInvite: (projectId: string, inviteId: string, userId: string, take: boolean, reason?: string) => void;
  setGoal: (projectId: string, g: { goal: string; doneWhen: string; doneBy?: number; brief?: string }) => void;
  /** The seat above keeps a late draft with a new start day (D15). */
  moveStart: (projectId: string, dueDay: number, why: string) => void;
  // A project that keeps moving (plan MOV): each one event.
  /** A new done-by working day, with why (D19). */
  moveDoneBy: (projectId: string, doneBy: number, why: string) => void;
  /** Pause until a working day (D20). */
  pause: (projectId: string, why: string, untilDay: number) => void;
  resume: (projectId: string) => void;
  /** The weekly check-in weekday (1 = Monday ... 5 = Friday) and a short note on how the team works (D21). */
  howWeWork: (projectId: string, checkInWeekday: number, note?: string) => void;
  /** The lead's weekly update; `week` is the check-in day number it is for (the demo's rule is rhythm.ts checkInDayOf). */
  update: (projectId: string, text: string, week: number) => void;
  /** A new lead while the project has none (D14). */
  changeLead: (projectId: string, to: { userId: string; name: string }, why?: string) => void;
  // A result that closes properly (plan RES): each one event, except stopAndReturn.
  /** Send a typed result back (D14). */
  question: (projectId: string, check: number, why: string) => void;
  /** A second person confirms the baseline number (D16). */
  confirmBaseline: (projectId: string) => void;
  /** Ask the sponsor for help on a step (D19). */
  askHelp: (projectId: string, stepId: string, text: string) => void;
  /** A stopped project's idea goes back to its desk (D24); the reducer sets the answer date in the demo. */
  reopen: (caseId: string, why: "stopped") => void;
  /** Stop, then - for `return` - reopen each source case whose latest decision is this project's yes, in that order, each awaiting the one before. */
  stopAndReturn: (projectId: string, why: string, pick: StopPick) => Promise<AppendOutcome>;
};

export function projectActs(d: ActDeps): ProjectAct {
  const { emit, S, serverMode } = d;
  return {
    page: {
      add: (id, input) => {
        const pageId = newId("page");
        emit("project.page.added", id, { ...input, pageId, tools: input.tools.map((tool) => ({ ...tool, toolId: newId("tool") })) });
        return pageId;
      },
      edit: (id, pageId, change) => emit("project.page.edited", id, { pageId, ...change }),
      move: (id, pageId, before) => emit("project.page.moved", id, { pageId, before }),
      remove: (id, pageId) => emit("project.page.removed", id, { pageId }),
      restore: (id, pageId) => emit("project.page.restored", id, { pageId }),
      addTool: (id, pageId, kind, before) => {
        const toolId = newId("tool");
        emit("project.tool.added", id, { pageId, toolId, kind, ...(before !== undefined ? { before } : {}) });
        return toolId;
      },
      moveTool: (id, toolId, toPageId, before) => emit("project.tool.moved", id, { toolId, toPageId, ...(before !== undefined ? { before } : {}) }),
      editTool: (id, toolId, change) => emit("project.tool.edited", id, { toolId, ...change }),
      removeTool: (id, toolId) => emit("project.tool.removed", id, { toolId }),
      restoreTool: (id, toolId) => emit("project.tool.restored", id, { toolId }),
      merge: (id, fromPageId, intoPageId) => {
        const mergeId = newId("merge");
        emit("project.page.merged", id, { mergeId, fromPageId, intoPageId });
        return mergeId;
      },
      unmerge: (id, mergeId) => emit("project.page.unmerged", id, { mergeId }),
    },
    // Taking a person off the team also frees their open steps (D22).
    member: (id, who, on) => emit("project.member", id, { name: who.name, userId: who.userId, on, ...(on ? {} : { unassign: true }) }),
    hand: (id, to, why) => emit("project.handed", id, { to: to.name, toUserId: to.userId, why }),
    baseline: (id, b) => emit("project.baseline", id, "none" in b ? { none: true, why: b.why } : { ...b }),
    start: (id) => emit("project.started", id),
    addStep: (id, text, owner, dueDay, to, note, ownerUserId) => { const stepId = newId("s"); emit("project.step.added", id, { stepId, text, owner, ...(ownerUserId ? { ownerUserId } : {}), dueDay, to, note }); return stepId; },
    moveStep: (id, stepId, to, why, before) => emit("project.step.moved", id, { stepId, to, why, ...(before !== undefined ? { before } : {}) }),
    editStep: (id, stepId, change) => emit("project.step.edited", id, { stepId, ...change }),
    link: (id, url, system = "url", key, stepId) => emit("project.linked", id, { url, system, key, stepId }),
    sync: (id, on, system = "jira") => {
      emit("project.sync", id, { system, on });
      const p = S.projects.find((x) => x.id === id);
      if (serverMode || !on || !p) return;
      // The demo's stand-in for the connector: an epic, then an issue for each step that has none.
      const url = (key: string) => DEMO_JIRA_SITE + "/browse/" + key;
      let n = S.projects.reduce((sum, x) => sum + x.links.filter((l) => l.system === system && l.key.startsWith(DEMO_JIRA_KEY + "-")).length, 0);
      if (!p.links.some((l) => l.system === system && l.stepId === null && l.key)) {
        const key = DEMO_JIRA_KEY + "-" + ++n;
        emit("project.linked", id, { system, key, url: url(key) });
      }
      for (const st of p.steps.filter((x) => !x.external)) {
        const key = DEMO_JIRA_KEY + "-" + ++n;
        emit("project.linked", id, { system, key, url: url(key), stepId: st.id });
      }
    },
    comment: (id, text) => emit("project.commented", id, { text }),
    done: (id, note, open) => emit("project.done", id, { note, ...(open !== undefined ? { openSteps: open } : {}) }),
    measure: (id, check, value, source, note) => emit("project.measured", id, { check, value, source, note }),
    reward: (id, rule, amount, note) => emit("project.rewarded", id, { rule, amount, note }),
    claim: (id) => emit("project.claimed", id),
    stop: (id, why) => emit("project.stopped", id, { why }),
    answerLead: (id, take, reason) => emit("project.lead.answered", id, { take, ...(!take && reason ? { reason } : {}) }),
    pickTemplate: (id, key, version, title) => emit("project.template", id, { key, version, ...(title ? { title } : {}) }),
    invite: (id, userId, role) => emit("project.invited", id, { userId, role }),
    answerInvite: (id, inviteId, userId, take, reason) => emit("project.invite.answered", id, { inviteId, userId, take, ...(!take && reason ? { reason } : {}) }),
    setGoal: (id, g) => emit("project.goal", id, { goal: g.goal, doneWhen: g.doneWhen, ...(g.doneBy !== undefined ? { doneBy: g.doneBy } : {}), ...(g.brief ? { brief: g.brief } : {}) }),
    moveStart: (id, dueDay, why) => emit("project.start.moved", id, { dueDay, why }),
    moveDoneBy: (id, doneBy, why) => emit("project.doneby.moved", id, { doneBy, why }),
    pause: (id, why, untilDay) => emit("project.paused", id, { why, untilDay }),
    resume: (id) => emit("project.resumed", id),
    howWeWork: (id, checkInWeekday, note) => emit("project.howwework", id, { checkInWeekday, ...(note ? { note } : {}) }),
    update: (id, text, week) => emit("project.update", id, { text, week }),
    changeLead: (id, to, why) => emit("project.lead.changed", id, { to: to.name, toUserId: to.userId, ...(why ? { why } : {}) }),
    question: (id, check, why) => emit("project.measure.questioned", id, { check, why }),
    confirmBaseline: (id) => emit("project.baseline.confirmed", id),
    askHelp: (id, stepId, text) => emit("project.help.asked", id, { stepId, text }),
    reopen: (caseId, why) => emit("case.reopened", caseId, { why }),
    stopAndReturn: async (id, why, pick) => {
      // The cases are read before the stop: afterwards the project is stopped and the choice is the same cases.
      const p = S.projects.find((x) => x.id === id);
      const cases = pick === "return" && p ? stopChoice(p, S).cases : [];
      const stopped = await emit("project.stopped", id, { why });
      if (!stopped.ok) return stopped;
      for (const c of cases) {
        const back = await emit("case.reopened", c.id, { why: "stopped" });
        if (!back.ok) return back;
      }
      return { ok: true };
    },
  };
}
