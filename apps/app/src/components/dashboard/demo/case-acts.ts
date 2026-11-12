// The demo's case acts (plan REG, decision D14): each one event as the current persona. A phase that adds a case act
// adds it here, never to DemoProvider.tsx.
import { appendEvent, newId, type EventPayload } from "@/features/cases/events";
import { handPayload } from "@/features/cases/hand";
import { affectedOn } from "@/features/cases/selectors";
import { isSampleId, SAMPLE_PREFIX } from "@/features/demo/sample-data";
import { acceptPayload, type AcceptPerson } from "@/features/projects/accept";
import { updateLog } from "@/lib/demo-log";
import type { AppendOutcome } from "@/server/actions/events";
import type { ActDeps } from "./act-deps";

export type CaseActs = {
  raise: (p: EventPayload, id?: string) => string; // id: minted by the caller when it has to be known first (the idea studio publishes with it)
  /** The idea studio's raise: publishes draft `draftId` with case `id`, or neither (Q1.11). Resolves with the server's answer. */
  raiseDraft: (p: EventPayload, id: string, draftId: string) => Promise<AppendOutcome>;
  read: (id: string) => void;
  decide: (id: string, answer: "yes" | "no", reason?: string, note?: string) => void;
  hand: (id: string, seatId: string, why?: string) => void; // the seat id; its label rides along as `to` (IDN/D5, D13)
  ask: (id: string, text: string) => void;
  answer: (id: string, text: string) => void;
  /** The raiser takes back an idea nobody decided yet (decision Q1.14); `note` is the optional line why. */
  withdraw: (id: string, note: string) => void;
  override: (id: string, proposed: string | null, chosen: string) => void;
  affect: (caseId: string, why?: string) => boolean; // "this affects me too" (+ why, from a lead) - true when added, false when withdrawn
  comment: (caseId: string, text: string) => void;
  rescore: (caseId: string, text: string) => void; // new information: the score is re-evaluated with it
  // The discussion stage (docs/plans/2026-10-15_idea-to-project.md)
  // `invited` are the labels shown, `invitedUserIds` who is asked (the ids decide, IDN/D2).
  discuss: (caseId: string, invited: string[], missing: string, invitedUserIds: string[]) => void;
  invite: (caseId: string, invited: string[], invitedUserIds: string[]) => void;
  revise: (caseId: string, body: string, title?: string, overall?: number) => void;
  checkin: (caseId: string, next: "round" | "decide", open: string[], note: string) => void;
  // "Yes, do it" that opens a draft (features/projects/accept, D10) - or adds the idea to the open project `join`.
  // The deciding person, the case title and a new project id are filled in here. Returns the project id.
  accept: (caseId: string, p: { lead?: AcceptPerson; join?: string; raiserNote?: string }) => string;
};

export function caseActs(d: ActDeps): CaseActs {
  const { emit, S, seed, serverMode, slug, actor, actorUserId, log } = d;
  return {
    // Stays synchronous and still returns the id: the idea studio hands it straight to saveShots().
    raise: (p, id = newId("c")) => { emit("case.raised", id, p); return id; },
    raiseDraft: (p, id, draftId) => emit("case.raised", id, p, undefined, draftId),
    read: (id) => emit("case.read", id),
    decide: (id, answer, reason, note) => emit("case.decided", id, { answer, reason, note }),
    hand: (id, seatId, why) => emit("case.handed", id, handPayload(seed.seats, seatId, why)),
    ask: (id, text) => emit("case.asked", id, { text }),
    answer: (id, text) => emit("case.answered", id, { text }),
    withdraw: (id, note) => emit("case.withdrawn", id, note ? { note } : {}),
    override: (id, proposed, chosen) => emit("case.override", id, { proposed, chosen }),
    affect: (caseId, why) => {
      // Decided against the log as it is at that moment, so a double click toggles cleanly.
      if (serverMode) {
        const added = !affectedOn(log, caseId).some((a) => actorUserId !== null && a.userId === actorUserId);
        emit(added ? "case.affected" : "case.unaffected", caseId, added && why ? { why } : undefined);
        return added;
      }
      let added = true;
      updateLog(slug, (prev) => {
        added = !affectedOn(prev, caseId).some((a) => actorUserId !== null && a.userId === actorUserId);
        return appendEvent(prev, { type: added ? "case.affected" : "case.unaffected", actor, actorUserId, target: caseId, payload: added && why ? { why } : undefined });
      });
      return added;
    },
    comment: (caseId, text) => emit("case.commented", caseId, { text }),
    rescore: (caseId, text) => emit("case.commented", caseId, { text, rescore: true }),
    discuss: (caseId, invited, missing, invitedUserIds) => emit("case.discussion", caseId, { invited, invitedUserIds, missing }),
    invite: (caseId, invited, invitedUserIds) => emit("case.invited", caseId, { invited, invitedUserIds }),
    revise: (caseId, body, title, overall) => emit("case.revised", caseId, { body, title, overall }),
    checkin: (caseId, next, open, note) => emit("case.checkin", caseId, { next, open, note }),
    accept: (caseId, { lead, join, raiserNote }) => {
      const payload = acceptPayload({
        caseTitle: S.cases.find((c) => c.id === caseId)?.title ?? "", decider: { userId: actorUserId, name: actor }, lead, join, raiserNote,
        newProjectId: (isSampleId(caseId) ? SAMPLE_PREFIX : "") + newId("p"),
      });
      emit("case.decided", caseId, payload);
      return payload.projectId as string;
    },
  };
}
