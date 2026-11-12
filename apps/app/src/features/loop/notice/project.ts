// The project area of the loop mails (REG/D10): one builder per project.* event type. MOV and RES add theirs here, never in notice.ts.
import { usersOfRole } from "@/features/auth/identity";
import { hasClosedAudience } from "@/features/cases/visibility";
import { isHandle } from "@/features/projects/views";
import { closingEvent } from "@/features/projects/close";
import { CONFIRM_DAYS, confirmerIds, unconfirmedOf } from "@/features/projects/confirm";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import type { MessageKey, T } from "@/i18n";
import { inDays, type NoticeBuilder, type NoticeBuilders } from "./shared";

/** The roles an invitation is for, as the catalog names them. */
const INVITE_ROLES: Record<"sponsor" | "member" | "contributor" | "follower", MessageKey> = {
  sponsor: "mail.inviteRoleSponsor", member: "mail.inviteRoleMember", contributor: "mail.inviteRoleContributor", follower: "mail.inviteRoleFollower",
};
/** The weekdays of a check-in, Monday to Friday (project.howwework). */
const WEEKDAYS: Record<number, MessageKey> = { 1: "projectMove.weekday1", 2: "projectMove.weekday2", 3: "projectMove.weekday3", 4: "projectMove.weekday4", 5: "projectMove.weekday5" };
/** How many of a draft's steps the kickoff mail lists. */
const KICKOFF_STEPS = 6;


const VERDICTS: Record<string, MessageKey> = { better: "projects.verdictBetter", same: "projects.verdictSame", worse: "projects.verdictWorse" };

/** How a closed project ended: its latest result against the baseline, and the recognition if there was one. */
function closedLines(t: T, p: ReducedProject): string[] {
  const m = p.measures[p.measures.length - 1];
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = m && b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  const verdict = m ? (VERDICTS[m.verdict] ? t(VERDICTS[m.verdict]) : m.verdict) : "";
  const result = m ? t(m.confirmed || m.sourceKind === "system" ? "mail.closedResult" : "mail.closedResultOpen", { days: m.check, verdict, numbers }) : t("mail.closedNoResult");
  const r = p.reward;
  if (!r) return [`  ${result}`];
  const reward = r.rule === "thanks" || r.amount == null ? t("mail.rewardThanks") : t("mail.rewardAmount", { amount: r.amount });
  return [`  ${result}`, `  ${r.note ? t("mail.closedRewardNote", { reward, note: r.note }) : t("mail.closedReward", { reward })}`];
}

function measured(t: T, p: ReducedProject, check: number | undefined): string {
  const m = p.measures.find((x) => x.check === check);
  if (!m) return t("mail.whatMeasuredNone");
  const b = p.baseline && !p.baseline.none ? p.baseline : null;
  const numbers = b ? ` ${b.metric}: ${b.value} → ${m.value}${b.unit ? " " + b.unit : ""}` : "";
  return t("mail.whatMeasured", { days: m.check, verdict: m.verdict, numbers });
}

/** The people a project's mails name by role (D23): the team is the lead and the members, the raiser is whoever raised the idea. */
const teamOf = (p: ReducedProject): (string | null)[] => [p.leadUserId, ...p.memberUserIds];

const projectHandedNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink, find }) => {
  if (!project) return;
  send(project.leadUserId, (t) => t("mail.leadSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.handedIntro", { actor: ev.actor }), ...(pl.why ? ["", pl.why] : []), "", projectLink(project)]);
  // The team (the old lead among them), the sponsor and the raiser hear who leads now, with the why (D23).
  const name = find(project.leadUserId)?.name || pl.to || project.lead;
  for (const who of [...project.memberUserIds, project.sponsorUserId, ...project.authorUserIds]) {
    send(who, (t) => t("projectMove.handedOthersSubject", { name, label: projectLabel(project), title: project.title }), (t) => [
      t("projectMove.handedOthersIntro", { name, label: projectLabel(project) }), ...(pl.why ? ["", t("projectMove.handedWhy", { why: pl.why })] : []), "", projectLink(project),
    ]);
  }
};

const projectStoppedNotice: NoticeBuilder = ({ ev, project, send, projectLink }) => {
  // Decisions Q6.21 and D16: the lead, the team, who raised the idea and the sponsor hear that it stopped, and why. Only the stop that
  // took effect: one after the reward, or a second one, changed nothing (features/projects/reduce.ts).
  const stop = project?.history.find((e) => e.type === "project.stopped");
  if (!project?.stopped || (ev.id !== undefined && stop?.id !== ev.id)) return;
  const why = project.stopped.why;
  for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds, project.sponsorUserId]) {
    send(who, (t) => t("mail.stoppedSubject", { label: projectLabel(project), title: project.title }), (t) => [
      t("mail.stoppedIntro", { actor: ev.actor }), "", `  ${why}`, "", t("mail.stoppedIdea"), "", projectLink(project),
    ]);
  }
};

const projectLeadAnsweredNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink }) => {
  // A decline, or a lapse the clock wrote: the draft is back with the decider, who leads it now (D11).
  if (!project?.draft || pl.take !== false || project.deciderUserId === null || project.leadUserId !== project.deciderUserId) return;
  const who = pl.lapsed === true ? null : ev.actor;
  send(project.deciderUserId, (t) => t("mail.draftBackSubject", { label: projectLabel(project), title: project.title }), (t) => [
    who === null ? t("mail.draftBackLapsed") : t("mail.draftBackDeclined", { name: who }),
    ...(pl.reason ? ["", t("mail.draftBackReason", { why: pl.reason })] : []), "", projectLink(project),
  ]);
};

const projectInvitedNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  if (!project?.draft || !pl.userId) return;
  const role = pl.role;
  // Only an invitation the reducer took (a refused one is not told).
  if (role === "follower") {
    if (!project.followerUserIds.includes(pl.userId)) return;
    send(pl.userId, (t) => t("mail.followSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.followIntro", { actor: ev.actor }), "", `  ${project.title}`, "", projectLink(project)]);
    return;
  }
  const invite = project.invites.find((i) => i.userId === pl.userId && i.role === role && (ev.id === undefined || i.id === ev.id));
  if (!invite) return;
  // Inviting on a private or custom idea lets the person read it (Q5.14): the mail says so.
  const closed = project.sources.some((id) => { const c = state.cases.find((x) => x.id === id); return c !== undefined && hasClosedAudience(c); });
  send(invite.userId, (t) => t("mail.inviteSubject", { label: projectLabel(project), title: project.title }), (t) => [
    t("mail.inviteIntro", { actor: ev.actor, label: projectLabel(project), title: project.title, role: t(INVITE_ROLES[invite.role]) }),
    ...(closed ? ["", t("mail.inviteReadsIdea")] : []), "", t("mail.inviteNext"), projectLink(project),
  ]);
};

const projectInviteAnsweredNotice: NoticeBuilder = ({ pl, state, project, send, projectLink, find }) => {
  // A decline or a lapse: the lead hears it, with the reason (D12). An acceptance: the raiser hears who joined (REM, Q5.14), unless they raised it
  // under a handle: an anonymous raiser stays anonymous and is not mailed.
  if (!project?.draft) return;
  const invite = project.invites.find((i) => (pl.inviteId !== undefined ? i.id === pl.inviteId : i.userId === pl.userId && i.state !== "pending"));
  if (!invite) return;
  const name = find(invite.userId)?.name ?? "";
  if (invite.state === "accepted") {
    for (const c of state.cases) {
      if (!project.sources.includes(c.id) || isHandle(c.from)) continue;
      send(c.fromUserId, (t) => t("mail.inviteAcceptedSubject", { label: projectLabel(project), title: project.title }), (t) => [
        t("mail.inviteAcceptedIntro", { name: name || t("mail.someone"), role: t(INVITE_ROLES[invite.role]) }), "", projectLink(project),
      ]);
    }
    return;
  }
  if (invite.state !== "declined" && invite.state !== "lapsed") return;
  send(project.leadUserId, (t) => t(invite.state === "lapsed" ? "mail.inviteLapsedSubject" : "mail.inviteDeclinedSubject", { label: projectLabel(project), title: project.title }), (t) => {
    const who = name || t("mail.someone");
    const role = t(INVITE_ROLES[invite.role]);
    return [
      invite.state === "lapsed" ? t("mail.inviteLapsedIntro", { name: who, role }) : t("mail.inviteDeclinedIntro", { name: who, role }),
      ...(invite.state === "declined" && invite.reason ? ["", t("mail.inviteReason", { why: invite.reason })] : []), "", projectLink(project),
    ];
  });
};

const projectStartMovedNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  // The seat above kept the draft with a new start day: the lead is told which (D15).
  if (!project?.draft || typeof pl.dueDay !== "number" || project.startDay !== pl.dueDay) return;
  const days = pl.dueDay - state.day;
  send(project.leadUserId, (t) => t("mail.startMovedSubject", { label: projectLabel(project), title: project.title }), (t) => [
    t("mail.startMovedIntro", { actor: ev.actor, when: inDays(t, days) }), ...(pl.why ? ["", t("mail.startMovedWhy", { why: pl.why })] : []), "", projectLink(project),
  ]);
};

const projectMemberNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink, find }) => {
  // Someone left the team with their open steps unassigned: the lead hears it once (D22).
  if (project && pl.on === false && pl.unassign === true) {
    const name = find(pl.userId)?.name || pl.name || "";
    send(project.leadUserId, (t) => t("projectMove.leftSubject", { name, label: projectLabel(project), title: project.title }), (t) => [t("projectMove.leftIntro", { name }), "", projectLink(project)]);
    return;
  }
  if (project && pl.on !== false && pl.userId) send(pl.userId, (t) => t("mail.memberSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.memberIntro", { actor: ev.actor }), "", projectLink(project)]);
};

const projectStepNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink, people }) => {
  if (!project) return;
  // The event that closes the project (decision Q6.20): one summary to the lead, the team, who raised the
  // idea, the sponsor and the followers, in place of the author's step mail for the same event.
  const closes = ev.id !== undefined && closingEvent(project, state.rules)?.id === ev.id;
  const summary = () => {
    // D15: the lead, the team, the raiser, the sponsor and the followers.
    for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds, project.sponsorUserId, ...project.followerUserIds]) {
      send(who, (t) => t("mail.closedSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.closedIntro"), "", ...closedLines(t, project), "", projectLink(project)]);
    }
  };
  if (ev.type === "project.measure.confirmed") {
    if (closes) summary();
    // The lead and the raiser hear every confirmation (RES D18); one mail each, so the summary above already told them when it closed the project.
    for (const who of [project.leadUserId, ...project.authorUserIds]) {
      send(who, (t) => t("projectResult.mailConfirmedSubject", { label: projectLabel(project), title: project.title }), (t) => [t("projectResult.mailConfirmedIntro", { label: projectLabel(project), what: measured(t, project, pl.check) }), "", projectLink(project)]);
    }
    return;
  }
  const step = ev.type === "project.started" ? "mail.stepStarted" : ev.type === "project.done" ? "mail.stepDone" : ev.type === "project.measured" ? "mail.stepMeasured" : "mail.stepRewarded";
  const what = (t: T): string => {
    if (ev.type === "project.started") return t("mail.whatStarted");
    if (ev.type === "project.done") return t("mail.whatDone");
    if (ev.type === "project.measured") return measured(t, project, pl.check);
    const r = project.reward;
    const reward = r?.rule === "thanks" || r?.amount == null ? t("mail.rewardThanks") : t("mail.rewardAmount", { amount: r.amount });
    return r?.note ? t("mail.whatRecognisedNote", { reward, note: r.note }) : t("mail.whatRecognised", { reward });
  };
  // A typed result needs a second person (decision Q6.15): who may confirm it is asked first, so someone who
  // is also an author gets the request, not the news.
  const waiting = ev.type === "project.measured" ? unconfirmedOf(project).find((x) => x.check === pl.check) : undefined;
  if (waiting) {
    const deputyRoleId = state.routes.find((r) => r.id === project.routeId)?.deputyRoleId ?? null;
    const managers = people.filter((p) => p.manager).map((p) => p.id);
    for (const id of confirmerIds(project, waiting, deputyRoleId, state.seats, managers, "desk")) {
      send(id, (t) => t("mail.confirmSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.confirmIntro", { name: waiting.measure.by, days: waiting.check, n: CONFIRM_DAYS }), "", projectLink(project)]);
    }
  }
  if (closes) summary();
  for (const a of project.authorUserIds) send(a, (t) => t("mail.stepSubject", { label: projectLabel(project), step: t(step), title: project.title }), (t) => [t("mail.stepIntro", { what: what(t) }), "", projectLink(project)]);
  // Done: the team and the sponsor hear it too (D23); the raiser has the step mail above, so one mail each.
  if (ev.type === "project.done") {
    for (const who of [...teamOf(project), project.sponsorUserId]) {
      send(who, (t) => t("projectMove.doneSubject", { label: projectLabel(project), title: project.title }), (t) => [t("projectMove.doneIntro", { actor: ev.actor, label: projectLabel(project) }), "", projectLink(project)]);
    }
  }
  // The kickoff of a draft (SET/D18): the team, the sponsor and the followers hear the goal and the first steps with their owners.
  if (ev.type === "project.started" && project.draft && project.startedDay !== null) {
    const g = project.goal;
    const first = project.steps.slice(0, KICKOFF_STEPS);
    for (const who of [...project.memberUserIds, project.sponsorUserId, ...project.followerUserIds]) {
      send(who, (t) => t("mail.kickoffSubject", { label: projectLabel(project), title: project.title }), (t) => [
        t("mail.kickoffIntro", { actor: ev.actor }), "", `  ${project.title}`,
        // The weekday the team agreed to check in on (project.howwework), when one was set (REM, P5.4).
        ...(project.checkInWeekday !== null && WEEKDAYS[project.checkInWeekday] ? [t("mail.kickoffRhythm", { weekday: t(WEEKDAYS[project.checkInWeekday]) })] : []),
        ...(g ? ["", t("mail.kickoffGoal", { goal: g.goal }), t("mail.kickoffDoneWhen", { doneWhen: g.doneWhen })] : []),
        ...(first.length ? ["", t("mail.kickoffSteps"), ...first.map((s) => t("mail.kickoffStep", { text: s.text, owner: s.owner ?? t("mail.kickoffNoOwner") }))] : []),
        "", projectLink(project),
      ]);
    }
  }
};

/** A new done-by date: the sponsor and the lead hear it, never whoever moved it (D23). */
const projectDoneByMovedNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  if (!project || typeof pl.doneBy !== "number") return;
  const days = pl.doneBy - state.day;
  for (const who of [project.sponsorUserId, project.leadUserId]) {
    send(who, (t) => t("projectMove.donebySubject", { label: projectLabel(project), title: project.title }), (t) => [
      t("projectMove.donebyIntro", { actor: ev.actor, label: projectLabel(project), when: inDays(t, days) }), ...(pl.why ? ["", t("projectMove.donebyWhy", { why: pl.why })] : []), "", projectLink(project),
    ]);
  }
};

/** A pause, with why and until when: the sponsor hears it (D20, D23). */
const projectPausedNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  if (!project || typeof pl.untilDay !== "number") return;
  const days = pl.untilDay - state.day;
  send(project.sponsorUserId, (t) => t("projectMove.pausedSubject", { label: projectLabel(project), title: project.title }), (t) => [
    t("projectMove.pausedIntro", { actor: ev.actor, label: projectLabel(project), when: inDays(t, days) }), ...(pl.why ? ["", t("projectMove.pausedWhy", { why: pl.why })] : []), "", projectLink(project),
  ]);
};

/** A pause ended early: the sponsor hears it. */
const projectResumedNotice: NoticeBuilder = ({ ev, project, send, projectLink }) => {
  if (!project) return;
  send(project.sponsorUserId, (t) => t("projectMove.resumedSubject", { label: projectLabel(project), title: project.title }), (t) => [
    t("projectMove.resumedIntro", { actor: ev.actor, label: projectLabel(project) }), "", projectLink(project),
  ]);
};

/**
 * The lead's weekly update (D21): a draft's sponsor, followers and raiser, a legacy project's team and raiser; never its
 * writer (send leaves the actor out), with the text itself in the mail.
 */
const projectUpdateNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  const text = pl.text?.trim();
  if (!project || !text) return;
  const audience = project.draft ? [project.sponsorUserId, ...project.followerUserIds, ...project.authorUserIds] : [...teamOf(project), ...project.authorUserIds];
  // The update of an accepted Report was drafted by the agent: the mail says so, and which role sent it (REM, Q7.16). The role is the sender's seat role, by id.
  const sentBy = state.seats.find((s) => s.userId !== null && s.userId === (ev.actorUserId ?? null));
  const role = sentBy === undefined ? "" : state.approvals.roles.find((r) => r.id === sentBy.roleId)?.title ?? "";
  for (const who of audience) {
    send(who, (t) => t("projectMove.updateSubject", { label: projectLabel(project), title: project.title }), (t) => [
      t("projectMove.updateIntro", { actor: ev.actor, label: projectLabel(project) }),
      ...(pl.aiDrafted === true ? [t(role ? "mail.updateDrafted" : "mail.updateDraftedPlain", { role })] : []),
      "", ...text.split(/\r?\n/).map((l) => `  ${l}`), "", projectLink(project),
    ]);
  }
};

/**
 * A leaver left a project without a lead: the sponsor, or without one the users of the desk that said yes (D14), and the
 * team hear that a new lead is needed. The desk is the route's owner role when someone holds it, else its deputy role.
 */
const projectLeadVacatedNotice: NoticeBuilder = ({ state, pl, project, send, projectLink }) => {
  if (!project) return;
  const route = state.routes.find((r) => r.id === project.routeId);
  const desk = [route?.ownerRoleId, route?.deputyRoleId].flatMap((roleId) => (roleId ? [usersOfRole(state.seats, roleId)] : [])).find((users) => users.length > 0) ?? [];
  const bySponsor = project.sponsorUserId !== null;
  for (const who of [...(bySponsor ? [project.sponsorUserId] : desk), ...project.memberUserIds.filter((u) => u !== pl.userId)]) {
    send(who, (t) => t("projectMove.vacatedSubject", { label: projectLabel(project), title: project.title }), (t) => [
      t(bySponsor ? "projectMove.vacatedIntroSponsor" : "projectMove.vacatedIntroDesk", { label: projectLabel(project) }), "", projectLink(project),
    ]);
  }
};

/** A claim of the reward (RES D18): every manager hears it, and nobody hears who - an anonymous raiser stays anonymous. */
const projectClaimedNotice: NoticeBuilder = ({ project, people, send, projectLink }) => {
  if (!project) return;
  for (const m of people.filter((p) => p.manager)) {
    send(m.id, (t) => t("projectResult.mailClaimedSubject", { label: projectLabel(project), title: project.title }), (t) => [t("projectResult.mailClaimedIntro", { label: projectLabel(project) }), "", projectLink(project)]);
  }
};

/** A result sent back (RES D14, D18): the lead is told what to enter again and why; the second time every manager is, who confirm it now. */
const projectQuestionedNotice: NoticeBuilder = ({ pl, project, people, send, projectLink }) => {
  if (!project) return;
  const managerOnly = project.measures.find((m) => m.check === pl.check)?.managerOnly === true;
  const why = (pl.why ?? "").trim();
  send(project.leadUserId, (t) => t("projectResult.mailQuestionedSubject", { label: projectLabel(project), title: project.title }), (t) => [
    t(managerOnly ? "projectResult.mailQuestionedAgain" : "projectResult.mailQuestionedIntro", { days: pl.check ?? "", label: projectLabel(project) }), ...(why ? ["", t("projectResult.mailWhy", { why })] : []), "", projectLink(project),
  ]);
  if (!managerOnly) return;
  for (const m of people.filter((p) => p.manager)) {
    send(m.id, (t) => t("projectResult.mailQuestionedSubject", { label: projectLabel(project), title: project.title }), (t) => [
      t("projectResult.mailQuestionedManager", { days: pl.check ?? "", label: projectLabel(project) }), ...(why ? ["", t("projectResult.mailWhy", { why })] : []), "", projectLink(project),
    ]);
  }
};

/** "Ask the sponsor" (RES D19): the asked person, else the users of the asked role's seats, with what is needed. */
const projectHelpAskedNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink }) => {
  if (!project) return;
  const ask = project.helpAsks.find((a) => ev.id !== undefined && a.id === ev.id) ?? project.helpAsks.findLast((a) => a.stepId === pl.stepId);
  if (!ask) return;
  const step = project.steps.find((s) => s.id === ask.stepId)?.text ?? "";
  const who = ask.toUserId !== null ? [ask.toUserId] : ask.toRoleId !== null ? usersOfRole(state.seats, ask.toRoleId) : [];
  for (const to of who) {
    send(to, (t) => t("projectResult.mailHelpSubject", { label: projectLabel(project), title: project.title }), (t) => [
      t("projectResult.mailHelpIntro", { actor: ev.actor, label: projectLabel(project), step }), "", `  ${ask.text}`, "", projectLink(project),
    ]);
  }
};

/** A baseline confirmed by a second person (RES D16): the lead may start. */
const projectBaselineConfirmedNotice: NoticeBuilder = ({ ev, project, send, projectLink }) => {
  if (!project) return;
  send(project.leadUserId, (t) => t("projectResult.mailBaselineSubject", { label: projectLabel(project), title: project.title }), (t) => [t("projectResult.mailBaselineIntro", { actor: ev.actor, label: projectLabel(project) }), "", projectLink(project)]);
};

export const PROJECT_NOTICES: NoticeBuilders = {
  "project.handed": projectHandedNotice,
  "project.stopped": projectStoppedNotice,
  "project.lead.answered": projectLeadAnsweredNotice,
  "project.invited": projectInvitedNotice,
  "project.invite.answered": projectInviteAnsweredNotice,
  "project.start.moved": projectStartMovedNotice,
  "project.member": projectMemberNotice,
  "project.started": projectStepNotice,
  "project.done": projectStepNotice,
  "project.measured": projectStepNotice,
  "project.measure.confirmed": projectStepNotice,
  "project.rewarded": projectStepNotice,
  // A project that keeps moving (plan MOV, D23). project.howwework tells nobody.
  "project.lead.changed": projectHandedNotice,
  "project.doneby.moved": projectDoneByMovedNotice,
  "project.paused": projectPausedNotice,
  "project.resumed": projectResumedNotice,
  "project.update": projectUpdateNotice,
  "project.lead.vacated": projectLeadVacatedNotice,
  // A result that closes properly (plan RES, D18). project.measure.confirmed is projectStepNotice's.
  "project.claimed": projectClaimedNotice,
  "project.measure.questioned": projectQuestionedNotice,
  "project.help.asked": projectHelpAskedNotice,
  "project.baseline.confirmed": projectBaselineConfirmedNotice,
};
