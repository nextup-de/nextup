"use client";
// The item that is open in the inbox, in the one shape IdeaDetail / IdeaDetailPhone take: its brief, the feed, what is
// already in motion and where each decision goes. The same facts the leader inbox shows (components/dashboard/leader/
// InboxView), read from the same context, so a decide item behaves the same wherever it opens.
import { holdsRole } from "@/features/auth/identity";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { askedForView, deskCases, inboxIdeas } from "@/components/dashboard/derive";
import type { IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import { costEurOf, fastLane, roundState, withDiscussion } from "@/features/cases/discussion";
import { readableComment } from "@/features/cases/notice";
import { raisedWith, sentLabel } from "@/features/cases/rows";
import { affectedOn, commentsOn, rescoresOn } from "@/features/cases/selectors";
import { badgeTone, briefFor, briefForCase, personFor } from "@/features/ideas/brief";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n";

// "Yesterday" -> "yesterday", "Monday" -> "on Monday", "09:14" -> "today"
const raisedPhrase = (t: T, label: string) => (/\d:\d/.test(label) || label === "Today" ? t("leader.raisedToday") : label === "Yesterday" ? t("leader.raisedYesterday") : t("leader.raisedOn", { day: label }));

/** Null when nothing is open, or the id is neither an idea waiting on this person nor a case on their desk or asked of them. */
export function useOpenItem(cid: string | null, close: () => void): IdeaProps | null {
  const ctx = useDemo();
  const t = useT();
  const [now] = useState(() => new Date()); // the page renders only once `ready`, so this never meets the server render
  if (cid === null || !ctx.ready) return null;
  const { seed, S, log, act, openSheet, showToast, f, me, flag } = ctx;
  const P = seed.promiseDays;
  const isMe = (userId: string | null | undefined) => me.userId !== null && userId === me.userId;
  const talk = flag("discussion"), projects = flag("projects");
  const si = inboxIdeas(ctx).find((i) => i.id === cid) ?? null;
  const views = talk ? askedForView(ctx) : [];
  const sc = si ? null : deskCases(ctx).find((c) => c.id === cid) ?? views.find((c) => c.id === cid) ?? null;
  const viewing = !!sc && views.includes(sc);
  const briefCtx = { people: seed.people, depts: seed.depts, ideas: seed.ideas, briefs: seed.briefs, t };
  const personOrNull = (name: string, userId: string | null | undefined) => (isMe(userId) ? null : personFor(name, briefCtx));
  const header = (id: string, kind: "idea" | "case", title: string, due: number, paused: boolean, sent: Date, exact: boolean, tag: string | null) => ({
    id, kind, title, tone: badgeTone(due, paused), raised: raisedPhrase(t, sentLabel(sent, now, exact)),
    badge: tag ?? (paused ? t("leader.badgePaused") : due < 0 ? t("leader.badgeLate", { n: -due }) : t("leader.badgeLeft", { n: due })),
  });
  const dayDate = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d; };

  if (si) {
    const brief = briefFor(si, briefCtx);
    const asked = si.thread.filter((m) => isMe(m.byUserId));
    return {
      idea: header(si.id, "idea", si.title, P - si.wait, false, dayDate(-si.wait), false, null), brief, onClose: close,
      feed: [
        ...brief.feed.comments.map((c) => ({ name: c.name, role: c.role, text: c.text, when: t("leader.daysShort", { n: c.daysAgo }), mine: false, person: personFor(c.name, briefCtx) })),
        ...si.thread.map((m) => ({ name: isMe(m.byUserId) ? t("leader.you") : m.by, role: t("leader.askedQuestion"), text: m.text, when: f(m.day), mine: isMe(m.byUserId), person: personOrNull(m.by, m.byUserId) })),
      ],
      status: asked.length ? { label: t("leader.moreInfoRequested"), lines: asked.map((m) => "“" + m.text + "” · " + f(m.day)), sub: t("leader.toldAuthor", { name: brief.author.name }) } : null,
      onDecide: (key: string) => {
        if (key === "approve") openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") });
        else if (key === "info") openSheet("askIdea", si.id);
      },
    };
  }
  if (!sc) return null;

  const route = sc.route;
  const scMine = !!route && holdsRole(me, route.ownerRoleId ?? null);
  const handTo = route ? (scMine ? route.deputy : route.owner.name) : t("leader.triageDesk");
  const lastHand = sc.handed[sc.handed.length - 1];
  const handedNote = sc.escalated && holdsRole(me, sc.escalated.toRoleId) && !holdsRole(me, sc.assigneeRoleId)
    ? t("leader.escalatedToYou", { day: f(sc.escalated.day), name: sc.assignee, days: P })
    : sc.escalated && holdsRole(me, sc.assigneeRoleId)
      ? t("leader.pastPromiseSince", { day: f(sc.escalated.day), to: sc.escalated.to })
      : lastHand ? t(lastHand.why ? "leader.handedFromWhy" : "leader.handedFrom", { from: lastHand.from, day: f(lastHand.day), why: lastHand.why ?? "" }) : "";

  const raisedEv = sc.history.find((e) => e.type === "case.raised" && !e.seed);
  const exact = !!raisedEv && sc.raisedDay === S.day;
  const d = sc.discussion, rs = roundState(sc, S.rules, S.day), last = d?.rounds[d.rounds.length - 1];
  const tag = viewing ? t("leader.tagYourView") : rs && !rs.ready ? (rs.left < 0 ? t("leader.tagCheckinLate", { n: -rs.left }) : t("leader.tagCheckinIn", { n: rs.left })) : null;
  const idea = header(sc.id, "case", sc.title, rs ? rs.left : P - sc.clock, sc.status === "asked", exact && raisedEv ? new Date(raisedEv.ts) : dayDate(sc.raisedDay - S.day), exact, tag);

  const raised = raisedWith(sc);
  const standing = [...raised.affected, ...affectedOn(log, sc.id).map((a) => a.name).filter((n) => !raised.affected.includes(n))];
  const q = sc.question;
  const plain = briefForCase(sc, briefCtx, { promiseDays: P, viewer: me, affected: standing, attachments: raised.attachments, updates: rescoresOn(log, sc.id).length, passTo: handTo, history: handedNote });
  const brief = viewing && d ? { ...plain, actions: [], rec: "", recText: t("leader.askedViewDecide", { by: d.by }), next: t("leader.commentBelow"), by: rs ? t("leader.beforeCheckin", { day: f(rs.dueDay) }) : null }
    : talk ? withDiscussion(plain, sc, { fast: fastLane(sc.body, S.rules.fastLaneEur), costEur: costEurOf(sc.body), limitEur: S.rules.fastLaneEur })
      : plain;
  const talkNote = d && rs ? {
    label: viewing ? t("leader.askedForView") : rs.ready ? t("leader.readyToDecide") : t("leader.inDiscussionRound", { round: rs.round, of: rs.of }),
    lines: [
      ...(viewing ? [t("leader.startedBy", { by: d.by, day: f(d.startedDay) })] : []),
      ...(d.missing ? [t("leader.missingLine", { what: d.missing })] : []),
      t("leader.invitedLine", { who: d.invited.length ? d.invited.join(", ") : t("leader.nobodyYet"), from: sc.from }),
      ...(last ? [t(last.open.length ? "leader.checkinLineOpen" : "leader.checkinLine", { round: last.round, day: f(last.day), next: last.next === "decide" ? t("leader.checkinReady") : t("leader.checkinAnother"), open: last.open.join(", ") })] : []),
    ],
    sub: rs.ready ? t("leader.decideNow") : rs.late ? t("leader.checkinLate", { n: -rs.left, day: f(rs.dueDay) }) : t("leader.nextCheckin", { day: f(rs.dueDay) }),
  } : null;
  return {
    idea, onClose: close, brief,
    feed: commentsOn(log, sc.id).map((m) => readableComment(m, t)).map((m) => ({ name: isMe(m.byUserId) ? t("leader.you") : m.by, role: m.rescore ? t("leader.newInformation") : t("leader.comment"), text: m.text, when: f(m.day), mine: isMe(m.byUserId), person: personOrNull(m.by, m.byUserId) })),
    status: talkNote ?? (!q ? null : {
      label: q.answer ? t("leader.answeredBy", { name: sc.from }) : q.unanswered !== null ? t("leader.noAnswer", { name: sc.from }) : t("leader.questionOut"),
      lines: [t("leader.youAsked", { text: q.text || t("leader.oneQuestion"), day: f(q.day) }), ...(q.answer ? [t("leader.answerLine", { text: q.answer.text, day: f(q.answer.day) })] : q.unanswered !== null ? [t("leader.noAnswerLine", { day: f(q.unanswered) })] : [])],
      sub: sc.status === "asked" ? t("leader.waitingFor", { name: sc.from, n: sc.clock }) : "",
    }),
    onDecide: (key: string) => {
      if (key === "yes" && projects) openSheet("accept", sc.id);
      else if (key === "yes") { act.decide(sc.id, "yes"); showToast(t("leader.toastYes", { n: sc.clock, name: sc.from })); }
      else if (key === "no") openSheet("no", sc.id);
      else if (key === "hand") openSheet("hand", sc.id, { picked: handTo });
      else if (key === "ask") openSheet("ask", sc.id);
      else if (key === "discuss" || key === "checkin" || key === "invite") openSheet(key, sc.id);
    },
    onComment: (text: string) => act.comment(sc.id, text),
  };
}
