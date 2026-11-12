// Follow-ups, merges and links between cases (plan SEE, decisions D15 and D17). Pure: a case, a person and plain values in,
// a verdict or a text out. The helpers never look anything up: a caller that offers a target hands in a case the person
// may open (the pickers offer only those), and no operation here widens who can read either case.
import type { Me } from "@/features/auth/identity";
import type { T } from "@/i18n";
import type { ReducedCase } from "./reducer";
import { noCategoryLabel, noCategoryOf, noReasonOf } from "./no";
import { onDeskOf } from "./selectors";

/** The note of a merge: up to this many characters (D17). */
export const MERGE_NOTE_MAX = 300;

/**
 * 'Start a better idea from it' (D15): the raiser of a case whose latest decision is a no - any category, any time, also while
 * a second look runs - and never on a withdrawn or merged case.
 */
export function mayFollow(c: Pick<ReducedCase, "fromUserId" | "decided" | "status">, userId: string | null): boolean {
  if (userId === null || c.fromUserId !== userId) return false;
  if (c.status === "withdrawn" || c.status === "merged") return false;
  return c.decided !== null && c.decided.answer === "no";
}

/** Where the raise page for a follow-up lives, after the company prefix (the caller adds `href`). */
export const followHref = (caseId: string): string => `/raise?follows=${encodeURIComponent(caseId)}`;

/**
 * The start of the follow-up: the old title as the first line, and the editable context 'Follows up on “{title}”. The answer
 * was: {reason}. What would make it a yes: {changeIf}.' - the last sentence only when the desk gave one.
 */
export function followDraft(c: Pick<ReducedCase, "title" | "decided">, t: T): { text: string; context: string } {
  const d = c.decided;
  const parts = [t("caseSee.followsUp", { title: c.title })];
  if (d !== null && d.answer === "no") {
    const category = noCategoryOf(d);
    const label = category === null ? "" : t(noCategoryLabel(category));
    const text = noReasonOf(d).trim();
    parts.push(t("caseSee.answerWas", { reason: label && text ? `${label}: ${text}` : label || text }));
    if (d.changeIf.trim() !== "") parts.push(t("caseSee.changeIfLine", { changeIf: d.changeIf.trim() }));
  }
  return { text: c.title, context: `${parts[0]}.${parts.length > 1 ? " " + parts.slice(1).join(" ") : ""}` };
}

type MergeSource = Pick<ReducedCase, "id" | "status" | "decided" | "withdrawn" | "merged" | "mergedIn" | "assigneeRoleId" | "escalated">;
type MergeTarget = Pick<ReducedCase, "id" | "status" | "withdrawn" | "merged">;

/**
 * The desk closes a duplicate (D17): a holder of the case's desk role or escalated role, or a manager, on an undecided case that
 * is neither withdrawn nor merged, into another case that is neither merged nor withdrawn (a decided one is allowed). A case that
 * absorbed repeats is not merged itself, so every merge points at a case that stays: no chain, no cycle - after A merged into B,
 * B cannot merge into A (A is merged). `dest` is a case the person may open, handed in by the caller; `mayOpenDest` says so.
 */
export function mayMerge(c: MergeSource, dest: MergeTarget | null, me: Me, isManager: boolean, mayOpenDest = true): boolean {
  if (dest === null || !mayOpenDest || dest.id === c.id) return false;
  if (!(c.status === "open" || c.status === "asked" || c.status === "discussion") || c.decided !== null || c.withdrawn !== null || c.merged !== null) return false;
  if (dest.merged !== null || dest.withdrawn !== null) return false;
  if (c.mergedIn.length > 0) return false;
  return isManager || onDeskOf(c as ReducedCase, me);
}

type LinkSource = Pick<ReducedCase, "id" | "withdrawn" | "merged" | "links" | "assigneeRoleId" | "escalated">;
type LinkTarget = Pick<ReducedCase, "id" | "merged">;

/**
 * The same people may mark two cases as related (D17): a case that is neither withdrawn nor merged, to another case that is not
 * merged and not linked to it yet. Both stay as they are. `peer` is a case the person may open, handed in by the caller.
 */
export function mayLink(c: LinkSource, peer: LinkTarget | null, me: Me, isManager: boolean, mayOpenPeer = true): boolean {
  if (peer === null || !mayOpenPeer || peer.id === c.id) return false;
  if (c.withdrawn !== null || c.merged !== null || peer.merged !== null || c.links.includes(peer.id)) return false;
  return isManager || onDeskOf(c as ReducedCase, me);
}
