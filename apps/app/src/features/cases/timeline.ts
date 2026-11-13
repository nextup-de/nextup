// One case's history as the case page tells it ("What happened"): one sentence per event, built from the event's own facts
// (an amount, an approval's answer, a reason). Facts in, one sentence out - nothing here is stored. Pure, so it is tested alone.
import type { ApprovalStepInput } from "@/features/approvals/types";
import type { T } from "@/i18n";
import { actorLabel, type ActorLabels } from "./actor-label";
import type { CaseEvent } from "./events";
import { NO_CATEGORIES, noCategoryLabel, type NoCategory } from "./no";

export type TimelineFacts = {
  /** The company's pseudonyms for actors, as actorLabel reads them. */
  labels?: ActorLabels;
  /** Another case as the viewer may see it: its title only when they may open it (plan SEE, D17). */
  other: (id: string | undefined) => { title: string | null } | null;
  /** Whole euros in the reader's layout. */
  money: (eur: number) => string;
  /** An approval step's name: its role's title or its council's name; "" when the company has neither. */
  approver: (step: ApprovalStepInput) => string;
  /** The name of the step an approval answer concerns, by its run and step id; "" when the case no longer knows it. */
  answeredStep: (runId: string | undefined, stepId: string | undefined) => string;
};

const ANSWER_KEY = { yes: "approvals.stepYes", conditions: "approvals.stepConditions", back: "approvals.stepBack", no: "approvals.stepNo" } as const;

const isNewCategory = (c: unknown): c is NoCategory => (NO_CATEGORIES as readonly unknown[]).includes(c);

export function timelineSentence(e: CaseEvent, t: T, facts: TimelineFacts): string {
  const p = e.payload;
  const actor = actorLabel(e, facts.labels);
  const reason = (text: string | undefined) => (text ? " " + t("dashboard.evReasonSuffix", { reason: text }) : "");
  const quote = (text: string | undefined) => (text ? t("dashboard.evNoteSuffix", { note: text }) : "");
  const why = (text: string | undefined) => (text ? " " + t("dashboard.evHandedWhy", { why: text }) : "");
  // The lead is named when it is someone else than the one who said yes; by user id, never by label (IDN/D2).
  const otherLead = p.lead && !(p.leadUserId && p.leadUserId === e.actorUserId) ? p.lead : null;
  switch (e.type) {
    case "case.raised": return t("dashboard.evRaised", { actor });
    case "case.read": return t("dashboard.evRead", { actor });
    case "case.decided": {
      // A reasoned no names its category before its reason (plan NOR, D17); an old no has none and reads as before.
      const no = p.answer === "no" && isNewCategory(p.category) ? t(noCategoryLabel(p.category)) : null;
      const because = no ? (p.reason ? `${no}: ${p.reason}` : no) : p.reason;
      return t("dashboard.evDecided", { actor, answer: p.answer ?? t("common.yes").toLowerCase() }) + reason(because) + quote(p.note)
        + (p.projectId ? " " + t("dashboard.evOpenedProject") + (otherLead ? " " + t("dashboard.evLedBy", { lead: otherLead }) : "") : "");
    }
    case "case.discussion": return t("dashboard.evDiscussion", { actor }) + (p.invited?.length ? " " + t("dashboard.evWith", { names: p.invited.join(", ") }) : "") + (p.missing ? " " + t("dashboard.evMissing", { missing: p.missing }) : "");
    case "case.invited": return t("dashboard.evInvited", { actor, names: (p.invited ?? []).join(", ") });
    case "case.invite.declined": return t("dashboard.evInviteDeclined", { actor }) + why(p.why);
    case "case.revised": return t("dashboard.evRevised", { actor }) + (typeof p.overall === "number" ? " " + t("dashboard.evScore", { n: p.overall }) : "");
    case "case.checkin": return t("dashboard.evCheckin", { actor, next: p.next === "decide" ? t("dashboard.evReadyToDecide") : t("dashboard.evAnotherRound") }) + (p.open?.length ? " " + t("dashboard.evOpenList", { list: p.open.join(", ") }) : "");
    case "case.handed": return p.why === "vacant" ? t("dashboard.evHandedVacant", { to: p.to ?? "" }) : t("dashboard.evHanded", { actor, to: p.to ?? "" }) + why(p.why);
    case "case.asked": return t("dashboard.evAsked", { actor, text: p.text || t("dashboard.evOneQuestion") });
    case "case.answered": return t("dashboard.evAnswered", { actor, text: p.text ?? "" });
    case "case.unanswered": return t("dashboard.evUnanswered");
    case "case.withdrawn": return p.note ? t("dashboard.evWithdrawnWhy", { actor, why: p.note }) : t("dashboard.evWithdrawn", { actor });
    case "case.building": return t("dashboard.evBuilding", { actor }) + (p.expected ? " " + t("dashboard.evExpected", { x: p.expected }) : "") + (p.days ? t("dashboard.evDaysSuffix", { n: p.days }) : "");
    case "case.shipped": return t("dashboard.evShipped", { actor, outcome: p.outcome ?? "" }) + (p.outcomeNote ? " " + t("dashboard.evParen", { note: p.outcomeNote }) : "");
    case "case.override": return t("dashboard.evOverride", { actor });
    case "case.commented": return t(p.rescore ? "dashboard.evCommentedNew" : "dashboard.evCommented", { actor, text: p.text ?? "" });
    case "case.affected": return t("dashboard.evAffected", { actor }) + why(p.why);
    case "case.unaffected": return t("dashboard.evUnaffected", { actor });
    // The other case's title only when the viewer may open it; a stripped or hidden target reads as "another one" (plan SEE, D17).
    case "case.merged": { const r = facts.other(p.into); return (r?.title ? t("loopCase.evMergedInto", { actor, title: r.title }) : t("loopCase.evMerged", { actor })) + quote(p.note); }
    case "case.linked": { const r = facts.other(p.to); return r?.title ? t("loopCase.evLinked", { actor, title: r.title }) : t("loopCase.evLinkedOther", { actor }); }
    // The reasoned no's second look and the way back to a desk (plan NOR, D12, D18).
    case "case.appealed": return p.text ? t("dashboard.evAppealedText", { actor, text: p.text }) : t("dashboard.evAppealed", { actor });
    case "case.appeal.decided": return t(p.uphold ? "dashboard.evAppealKept" : "dashboard.evAppealReopened", { actor }) + reason(p.reason);
    case "case.reopened": return t(p.why === "revisit" ? "dashboard.evReopenedRevisit" : p.why === "stopped" ? "dashboard.evReopenedStopped" : "dashboard.evReopened");
    // Review, cost and approvals (plan GAT, D14, D18, D21, D22).
    case "case.reviewed":
      if (p.auto) return t("dashboard.evReviewedAuto");
      return p.to ? t("dashboard.evReviewedTo", { actor, to: p.to }) : t("dashboard.evReviewed", { actor });
    case "case.costed": return t("dashboard.evCosted", { actor, eur: facts.money(p.eur ?? 0) }) + (p.basis ? " " + t("dashboard.evParen", { note: p.basis }) : "");
    case "case.provisional": {
      const approvers = (p.approvals ?? []).map(facts.approver).filter((n) => n !== "").join(", ");
      const head = p.supplement
        ? (approvers ? t("dashboard.evSupplement", { actor, approvers }) : t("dashboard.evSupplementNoNames", { actor }))
        : (approvers ? t("dashboard.evProvisional", { actor, approvers }) : t("dashboard.evProvisionalNoNames", { actor }));
      return head + quote(p.note) + (!p.supplement && otherLead ? " " + t("dashboard.evDraftLedBy", { lead: otherLead }) : "");
    }
    case "case.approval": {
      const answer = p.approvalAnswer ? t(ANSWER_KEY[p.approvalAnswer]) : "";
      const step = facts.answeredStep(p.runId, p.stepId);
      return (step ? t("dashboard.evApprovalFor", { actor, approver: step, answer }) : t("dashboard.evApproval", { actor, answer }))
        + (p.approvalAnswer === "conditions" ? quote(p.conditions) : "")
        + (p.approvalAnswer === "back" || p.approvalAnswer === "no" ? reason(p.reason) : "")
        + (typeof p.present === "number" ? " " + t("dashboard.evPresent", { n: p.present }) : "");
    }
    default: return actor + " · " + e.type;
  }
}
