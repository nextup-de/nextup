// GAT-U2 (B1): what the yes sheet offers and sends where approvals may apply (plan GAT, D19, D20, D21). Flat tests (D36).
import { expect, it } from "vitest";
import { yesSheetModel } from "@/features/approvals/yes-sheet";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo } from "@/features/approvals/types";
import type { ReducedCase, State } from "@/features/cases/reducer";

const ROLES: ApprovalRoleInfo[] = [
  { id: "role_head", title: "Director", reportsToId: null, spendLimitEur: null },
  { id: "role_plant", title: "Plant manager", reportsToId: "role_head", spendLimitEur: 25_000 },
  { id: "role_owner", title: "Quality lead", reportsToId: "role_plant", spendLimitEur: 5_000 },
  { id: "role_legal", title: "Legal", reportsToId: "role_head", spendLimitEur: null },
  { id: "role_safety", title: "Safety officer", reportsToId: "role_head", spendLimitEur: null },
];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_head", everyDays: 10, firstDay: 3 };

function state(config: Partial<ApprovalConfig> = {}): Pick<State, "approvals" | "rules"> {
  return { approvals: { ...EMPTY_APPROVAL_CONFIG, ...config, roles: ROLES }, rules: { fastLaneEur: 5_000 } as State["rules"] };
}
const kase = (eur: number | null = null): Pick<ReducedCase, "title" | "assigneeRoleId" | "routeId" | "cost"> => ({
  title: "Second tool cart", assigneeRoleId: "role_owner", routeId: "r1", cost: eur === null ? null : { eur, basis: "Two offers", day: 1, by: "T. Vogel", byUserId: "u_own" },
});
const person = { userId: "u_own", name: "T. Vogel" };

it("GAT yes sheet offers only Yes if approved when approvals apply", () => {
  // A cost above the deciding role's limit and the fast lane: the budget approver first, then the council and the role of the rules, in order.
  const s = state({
    councils: [COUNCIL],
    rules: [{ id: "a", kind: "role", roleId: "role_legal", routeKey: null, minEur: null }, { id: "b", kind: "council", councilId: "k1", routeKey: "r1", minEur: 10_000 }],
  });
  const m = yesSheetModel(kase(12_000), s, [], null);
  expect(m.onlyIfApproved).toBe(true);
  expect(m.provisional).toBe(true);
  expect(m.approvers).toEqual([
    { label: "Plant manager", kind: "budget" },
    { label: "Investment council", kind: "council" },
    { label: "Legal", kind: "role" },
  ]);
  // A rule alone is enough, with no cost at all.
  expect(yesSheetModel(kase(), s, [], null).approvers).toEqual([{ label: "Legal", kind: "role" }]);
});

it("GAT yes sheet says no budget check without a cost", () => {
  const s = state({ rules: [{ id: "a", kind: "role", roleId: "role_legal", routeKey: null, minEur: null }] });
  expect(yesSheetModel(kase(), s, [], null).noBudgetCheck).toBe(true);
  expect(yesSheetModel(kase(0), s, [], null).noBudgetCheck).toBe(false);
  expect(yesSheetModel(kase(12_000), s, [], null).noBudgetCheck).toBe(false);
});

it("GAT yes sheet offers both answers otherwise", () => {
  const m = yesSheetModel(kase(1_000), state(), [], null);
  expect(m.onlyIfApproved).toBe(false);
  expect(m.provisional).toBe(false);
  expect(m.approvers).toEqual([]);
  // A rule that does not match this cost or route leaves the plain yes too.
  const far = state({ rules: [{ id: "a", kind: "role", roleId: "role_legal", routeKey: "r9", minEur: null }, { id: "b", kind: "role", roleId: "role_safety", routeKey: null, minEur: 50_000 }] });
  expect(yesSheetModel(kase(1_000), far, [], null).onlyIfApproved).toBe(false);
});

it("GAT yes sheet names the joined project", () => {
  const m = yesSheetModel(kase(), state({ rules: [{ id: "a", kind: "role", roleId: "role_legal", routeKey: null, minEur: null }] }), [], { projectId: "p9", title: "Rig on line 3" });
  expect(m.joinLine).toBe("Joins Rig on line 3 once approved");
  expect(m.payload({ decider: person }).projectId).toBe("p9");
  expect(yesSheetModel(kase(), state(), [], null).joinLine).toBeNull();
  expect(yesSheetModel(kase(), state(), [], null, "de").joinLine).toBeNull();
  expect(yesSheetModel(kase(), state(), [], { projectId: "p9", title: "Rig" }, "de").joinLine).toBe("Schliesst sich Rig an, sobald freigegeben");
});

it("GAT yes sheet marks hand-added roles byHand", () => {
  const s = state({ rules: [{ id: "a", kind: "role", roleId: "role_legal", routeKey: null, minEur: null }] });
  // The desk adds Safety; a role that does not exist and the deciding role itself are not steps, and Legal is not added twice.
  const m = yesSheetModel(kase(), s, ["role_safety", "role_legal", "role_nobody", "role_owner"], null);
  const p = m.payload({ decider: person, lead: { userId: "u_lead", name: "L. Brandt" }, raiserNote: " Thank you ", note: "Check the fire load", newProjectId: "p_new" });
  expect(p.approvals).toEqual([{ kind: "role", roleId: "role_legal", byHand: false }, { kind: "role", roleId: "role_safety", byHand: true }]);
  expect(p).toMatchObject({ draft: true, projectId: "p_new", lead: "L. Brandt", leadUserId: "u_lead", title: "Second tool cart", raiserNote: "Thank you", note: "Check the fire load" });
  // Roles added by hand make the yes provisional even where no rule applies; the plain yes stays offered.
  const bare = yesSheetModel(kase(), state(), ["role_safety"], null);
  expect(bare).toMatchObject({ onlyIfApproved: false, provisional: true, approvers: [{ label: "Safety officer", kind: "role" }] });
  expect(bare.payload({ decider: person }).approvals).toEqual([{ kind: "role", roleId: "role_safety", byHand: true }]);
  // The payload carries no steps' due days or limits: the server stamps them.
  expect(JSON.stringify(p)).not.toMatch(/stepDueDay|coversUpToEur|decidingRoleId/);
});
