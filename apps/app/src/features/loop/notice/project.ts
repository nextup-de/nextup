// The project area of the loop mails (REG/D10): one builder per project.* event type. MOV and RES add theirs here, never in notice.ts.
import { hasClosedAudience } from "@/features/cases/visibility";
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

const projectHandedNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink }) => {
  if (project) send(project.leadUserId, (t) => t("mail.leadSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.handedIntro", { actor: ev.actor }), ...(pl.why ? ["", pl.why] : []), "", projectLink(project)]);
};

const projectStoppedNotice: NoticeBuilder = ({ ev, project, send, projectLink }) => {
  // Decision Q6.21: the lead, the team and who raised the idea hear that it stopped, and why. Only the stop that
  // took effect: one after the reward, or a second one, changed nothing (features/projects/reduce.ts).
  const stop = project?.history.find((e) => e.type === "project.stopped");
  if (!project?.stopped || (ev.id !== undefined && stop?.id !== ev.id)) return;
  const why = project.stopped.why;
  for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds]) {
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

const projectInviteAnsweredNotice: NoticeBuilder = ({ pl, project, send, projectLink, find }) => {
  // A decline or a lapse: the lead hears it, with the reason (D12).
  if (!project?.draft) return;
  const invite = project.invites.find((i) => (pl.inviteId !== undefined ? i.id === pl.inviteId : i.userId === pl.userId && (i.state === "declined" || i.state === "lapsed")));
  if (!invite || (invite.state !== "declined" && invite.state !== "lapsed")) return;
  const name = find(invite.userId)?.name ?? "";
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

const projectMemberNotice: NoticeBuilder = ({ ev, pl, project, send, projectLink }) => {
  if (project && pl.on !== false && pl.userId) send(pl.userId, (t) => t("mail.memberSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.memberIntro", { actor: ev.actor }), "", projectLink(project)]);
};

const projectStepNotice: NoticeBuilder = ({ ev, state, pl, project, send, projectLink, people }) => {
  if (!project) return;
  // The event that closes the project (decision Q6.20): one summary to the lead, the team and who raised the
  // idea, in place of the author's step mail for the same event.
  const closes = ev.id !== undefined && closingEvent(project, state.rules)?.id === ev.id;
  const summary = () => {
    for (const who of [project.leadUserId, ...project.memberUserIds, ...project.authorUserIds]) {
      send(who, (t) => t("mail.closedSubject", { label: projectLabel(project), title: project.title }), (t) => [t("mail.closedIntro"), "", ...closedLines(t, project), "", projectLink(project)]);
    }
  };
  if (ev.type === "project.measure.confirmed") {
    if (closes) summary();
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
  // The kickoff of a draft (SET/D18): the team, the sponsor and the followers hear the goal and the first steps with their owners.
  if (ev.type === "project.started" && project.draft && project.startedDay !== null) {
    const g = project.goal;
    const first = project.steps.slice(0, KICKOFF_STEPS);
    for (const who of [...project.memberUserIds, project.sponsorUserId, ...project.followerUserIds]) {
      send(who, (t) => t("mail.kickoffSubject", { label: projectLabel(project), title: project.title }), (t) => [
        t("mail.kickoffIntro", { actor: ev.actor }), "", `  ${project.title}`,
        ...(g ? ["", t("mail.kickoffGoal", { goal: g.goal }), t("mail.kickoffDoneWhen", { doneWhen: g.doneWhen })] : []),
        ...(first.length ? ["", t("mail.kickoffSteps"), ...first.map((s) => t("mail.kickoffStep", { text: s.text, owner: s.owner ?? t("mail.kickoffNoOwner") }))] : []),
        "", projectLink(project),
      ]);
    }
  }
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
};
