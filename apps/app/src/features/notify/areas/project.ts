// The project area of the notify registries (REG D10): the project events that mail, the project reminders (SET's lead,
// invite and draft included) with their text and audience, and which of them are a duty. MOV and RES add to this file,
// never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts).
import type { CaseEventType } from "@/features/cases/events";
import { DRAFT_UP_DAYS } from "@/features/clock/due";
import { rewardEpisodeOf } from "@/features/clock/kinds/project";
import { confirmerIds, unconfirmedOf } from "@/features/projects/confirm";
import type { PlanEvent, ReminderAudienceFn, ReminderCtx, ReminderTextFn } from "./shared";

/** The project events that become loop notices (`loop.<type>`). */
export const PROJECT_LOOP_TYPES = [
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.measure.confirmed", "project.rewarded", "project.stopped",
  "project.lead.answered", "project.invited", "project.invite.answered", "project.start.moved",
  // A project that keeps moving (plan MOV, D23).
  "project.doneby.moved", "project.paused", "project.resumed", "project.howwework", "project.update", "project.lead.vacated", "project.lead.changed",
  // A result that closes properly (plan RES, D18): a claim told nobody before (Q2.14). RES-E1 adds the recipients and the render entries.
  "project.measure.questioned", "project.baseline.confirmed", "project.help.asked", "project.claimed",
] as const satisfies readonly CaseEventType[];

/** The loop templates of the project events, as the profile's switches name them. */
export const PROJECT_LOOP_TEMPLATES: readonly string[] = PROJECT_LOOP_TYPES.map((t) => `loop.${t}`);

/** Templates added after people set their switches, each with the older one it follows (see notify/digest.ts FOLLOWS). */
export const PROJECT_FOLLOWS: Record<string, string> = {
  "reminder.confirm": "reminder.measure", "loop.project.measure.confirmed": "loop.project.measured",
  "loop.project.stopped": "loop.project.done",
  // The project draft (plan SET): an opt-out of the project mails covers the new ones until the person chooses again.
  "loop.project.lead.answered": "loop.project.member", "loop.project.invited": "loop.project.member",
  "loop.project.invite.answered": "loop.project.member", "loop.project.start.moved": "loop.project.member",
  "reminder.lead": "reminder.start", "reminder.invite": "reminder.start", "reminder.draft": "reminder.start",
  // A project that keeps moving (plan MOV): the same opt-out covers the new loop notices and reminders (MOV-E1 adds the reminder kinds).
  "loop.project.doneby.moved": "loop.project.member", "loop.project.paused": "loop.project.member", "loop.project.resumed": "loop.project.member",
  "loop.project.howwework": "loop.project.member", "loop.project.update": "loop.project.member", "loop.project.lead.vacated": "loop.project.member",
  "loop.project.lead.changed": "loop.project.member",
  "reminder.late": "reminder.start", "reminder.blocked": "reminder.start", "reminder.quiet": "reminder.start",
  "reminder.stalled": "reminder.start", "reminder.update": "reminder.start", "reminder.vacant": "reminder.start",
  // A result that closes properly (plan RES): an opt-out of the result notices covers the new ones; the reward reminder follows the confirm reminder.
  "loop.project.measure.questioned": "loop.project.measured", "loop.project.baseline.confirmed": "loop.project.measured",
  "loop.project.help.asked": "loop.project.measured", "loop.project.claimed": "loop.project.measured",
  "reminder.reward": "reminder.confirm",
};

export const PROJECT_REMINDER_KINDS = ["start", "measure", "confirm", "lead", "invite", "draft", "late", "blocked", "quiet", "stalled", "update", "vacant", "reward"] as const;
type ProjectReminderKind = (typeof PROJECT_REMINDER_KINDS)[number];

/** The render entries of the project reminders. */
export const PROJECT_REMINDER_TEXTS: Record<`reminder.${ProjectReminderKind}`, ReminderTextFn> = {
  "reminder.start": (_i, t, compose, { title, when, url }) =>
    compose(t("mail.reminderStartSubject", { title }), t("mail.reminderStartIntro", { when }), t("mail.reminderOpenProject", { url })),
  "reminder.measure": (_i, t, compose, { title, days, url }) =>
    compose(t("mail.reminderMeasureSubject", { title }), t("mail.reminderMeasureIntro", { days }), t("mail.reminderOpenProject", { url })),
  "reminder.confirm": (input, t, compose, { title, days, url }) =>
    compose(t("mail.reminderConfirmSubject", { title }), t(input.reader === "above" ? "mail.reminderConfirmAbove" : "mail.reminderConfirmIntro", { days }), t("mail.reminderOpenProject", { url })),
  "reminder.lead": (_i, t, compose, { title, url }) =>
    compose(t("mail.reminderLeadSubject", { title }), t("mail.reminderLeadIntro"), t("mail.reminderOpenProject", { url })),
  "reminder.invite": (_i, t, compose, { title, url }) =>
    compose(t("mail.reminderInviteSubject", { title }), t("mail.reminderInviteIntro"), t("mail.reminderOpenProject", { url })),
  // The lead is told the start day has passed; the seat above is asked what to do with the draft (D15).
  "reminder.draft": (input, t, compose, { title, when, url }) =>
    input.reader === "above"
      ? compose(t("mail.reminderDraftAboveSubject", { title }), t("mail.reminderDraftAbove", { when }), t("mail.reminderOpenProject", { url }))
      : compose(t("mail.reminderDraftSubject", { title }), t("mail.reminderDraftLead", { when }), t("mail.reminderOpenProject", { url })),
  // A project that keeps moving (plan MOV, D23). The step and its reason come from the audience below, never from a label.
  "reminder.late": (input, t, compose, { title, when, url }) =>
    compose(t("projectMove.reminderLateSubject", { step: input.step ?? "" }), t("projectMove.reminderLateIntro", { step: input.step ?? "", project: title, when }), t("mail.reminderOpenProject", { url }), false),
  "reminder.blocked": (input, t, compose, { title, when, url }) =>
    compose(t("projectMove.reminderBlockedSubject", { step: input.step ?? "" }), t("projectMove.reminderBlockedIntro", { step: input.step ?? "", project: title, when, why: input.why ?? "" }), t("mail.reminderOpenProject", { url }), false),
  "reminder.quiet": (_i, t, compose, { title, url }) =>
    compose(t("projectMove.reminderQuietSubject", { title }), t("projectMove.reminderQuietIntro", { project: title }), t("mail.reminderOpenProject", { url }), false),
  "reminder.stalled": (_i, t, compose, { title, url }) =>
    compose(t("projectMove.reminderStalledSubject", { title }), t("projectMove.reminderStalledIntro", { project: title }), t("mail.reminderOpenProject", { url }), false),
  "reminder.update": (_i, t, compose, { title, url }) =>
    compose(t("projectMove.reminderUpdateSubject", { title }), t("projectMove.reminderUpdateIntro", { project: title }), t("mail.reminderOpenProject", { url }), false),
  "reminder.vacant": (_i, t, compose, { title, url }) =>
    compose(t("projectMove.reminderVacantSubject", { title }), t("projectMove.reminderVacantIntro", { project: title }), t("mail.reminderOpenProject", { url }), false),
  // A result that closes properly (plan RES, D17): a reward that fell due is still waiting; every manager is reminded once.
  "reminder.reward": (_i, t, compose, { title, when, url }) =>
    compose(t("projectResult.reminderRewardSubject", { title }), t("projectResult.reminderRewardIntro", { project: title, when }), t("mail.reminderOpenProject", { url }), false),
};

/** The people a MOV fact names: its user and the users of its seat (D23), once each. */
const factPeople = (ev: PlanEvent, { usersOfSeat, uniq }: ReminderCtx): string[] =>
  uniq([...(ev.payload.userId ? [ev.payload.userId] : []), ...usersOfSeat(ev.payload.toRoleHolderId)]);

/** The reminders of a project that keeps moving (D23): late, blocked, quiet, stalled, update and vacant. */
export const PROJECT_MOVE_REMINDER_AUDIENCE: Record<"late" | "blocked" | "quiet" | "stalled" | "update" | "vacant", ReminderAudienceFn> = {
  late: (ev, ctx) => {
    const { project, projectLink } = ctx;
    if (!project) return null;
    // The step the fact names, while it is still open; its due day is the one the text says was missed.
    const step = project.steps.find((s) => s.id === ev.payload.stepId);
    return {
      users: step && step.column !== "done" ? factPeople(ev, ctx) : [], title: project.title, link: projectLink(project.id),
      day: step?.dueDay ?? ev.payload.dueDay, varsFor: () => ({ step: step?.text ?? "" }),
    };
  },
  blocked: (ev, ctx) => {
    const { project, projectLink } = ctx;
    if (!project) return null;
    const step = project.steps.find((s) => s.id === ev.payload.stepId);
    return {
      users: step && step.column === "blocked" ? factPeople(ev, ctx) : [], title: project.title, link: projectLink(project.id),
      day: step?.movedDay ?? ev.payload.dueDay, varsFor: () => ({ step: step?.text ?? "", why: step?.why ?? "" }),
    };
  },
  quiet: (ev, ctx) => (ctx.project ? { users: factPeople(ev, ctx), title: ctx.project.title, link: ctx.projectLink(ctx.project.id), day: ctx.project.doneBy ?? ev.payload.dueDay } : null),
  stalled: (ev, ctx) => (ctx.project ? { users: factPeople(ev, ctx), title: ctx.project.title, link: ctx.projectLink(ctx.project.id), day: ctx.project.doneBy ?? ev.payload.dueDay } : null),
  update: (ev, ctx) => (ctx.project ? { users: factPeople(ev, ctx), title: ctx.project.title, link: ctx.projectLink(ctx.project.id) } : null),
  vacant: (ev, ctx) => (ctx.project ? { users: factPeople(ev, ctx), title: ctx.project.title, link: ctx.projectLink(ctx.project.id) } : null),
};

/**
 * The reward reminder (RES D17, D18): every manager, while the episode it was written for still stands - the reward is due, the project
 * runs on, and the result that made it due is still the latest. A fact of an episode that ended (paid, sent back, replaced) mails nobody.
 */
const rewardAudience: ReminderAudienceFn = (ev, { project, people, projectLink }) => {
  if (!project) return null;
  const standing = project.rewardDue && project.rewardDueDay !== null && project.status !== "stopped" && project.status !== "recognised"
    && (ev.payload.originEventId === undefined || ev.payload.originEventId === rewardEpisodeOf(project));
  return { users: standing ? people.filter((p) => p.manager).map((p) => p.id) : [], title: project.title, link: projectLink(project.id), day: project.rewardDueDay };
};

/** Who gets each project reminder, with which title, link and text input. */
export const PROJECT_REMINDER_AUDIENCE: Record<ProjectReminderKind, ReminderAudienceFn> = {
  // The lead, and when the clock escalated a late one the users of the seat it named (F3, D23).
  start: (ev, { project, projectLink, usersOfSeat, uniq }) =>
    project ? { users: uniq([...(project.leadUserId ? [project.leadUserId] : []), ...usersOfSeat(ev.payload.toRoleHolderId)]), title: project.title, link: projectLink(project.id) } : null,
  measure: (ev, { project, projectLink, usersOfSeat, uniq }) =>
    project ? { users: uniq([...(project.leadUserId ? [project.leadUserId] : []), ...usersOfSeat(ev.payload.toRoleHolderId)]), title: project.title, link: projectLink(project.id) } : null,
  confirm: (ev, { state, people, project, projectLink }) => {
    if (!project) return null;
    // A result nobody confirmed in time: who may confirm it, or the seat above the clock passed it up to.
    const u = unconfirmedOf(project).find((x) => x.check === ev.payload.check);
    const deputyRoleId = state.routes.find((r) => r.id === project.routeId)?.deputyRoleId ?? null;
    const managers = people.filter((p) => p.manager).map((p) => p.id);
    const above = !!ev.payload.toRoleHolderId;
    return {
      users: u ? confirmerIds(project, u, deputyRoleId, state.seats, managers, above ? "above" : "desk") : [], title: project.title, link: projectLink(project.id),
      ...(above ? { varsFor: () => ({ reader: "above" as const }) } : {}),
    };
  },
  lead: (_ev, { project, projectLink }) =>
    // Only while the draft still waits for the lead's answer.
    project ? {
      users: project.draft && project.startedDay === null && project.stopped === null && project.leadState === "pending" && project.leadUserId ? [project.leadUserId] : [],
      title: project.title, link: projectLink(project.id),
    } : null,
  invite: (ev, { project, projectLink }) => {
    if (!project) return null;
    // The invitation the fact names, while nobody answered it; a fact without an id names the person's one open invitation.
    const open = project.invites.filter((i) => i.state === "pending" && i.userId === ev.payload.userId && (ev.payload.inviteId === undefined || i.id === ev.payload.inviteId));
    return { users: open.length === 1 ? [open[0].userId] : [], title: project.title, link: projectLink(project.id) };
  },
  draft: (ev, { project, projectLink, usersOfSeat, uniq }) => {
    if (!project) return null;
    // The lead and the seat the clock gave the draft to; the second reminder (check 3) goes to the seat only.
    const above = usersOfSeat(ev.payload.toRoleHolderId);
    const lead = project.leadUserId && ev.payload.check !== DRAFT_UP_DAYS ? [project.leadUserId] : [];
    return {
      users: project.draft && project.startedDay === null && project.stopped === null ? uniq([...lead, ...above]) : [],
      title: project.title, link: projectLink(project.id),
      varsFor: (userId) => ({ reader: above.includes(userId) ? "above" : "lead" }),
    };
  },
  ...PROJECT_MOVE_REMINDER_AUDIENCE,
  reward: rewardAudience,
};

/** The project notices a person cannot switch off, only move between Teams and mail (INB D8; SET: a person waited for, or a start that is late; MOV D23: a project that stalled or has no lead). */
export const PROJECT_DUTY_TEMPLATES = ["reminder.confirm", "reminder.start", "reminder.measure", "reminder.lead", "reminder.invite", "reminder.draft", "reminder.stalled", "reminder.vacant"] as const;

/** The project events server/loop-notice.ts mails. */
export const PROJECT_LOOP_MAIL_TYPES: readonly CaseEventType[] = PROJECT_LOOP_TYPES;
