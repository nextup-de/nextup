// GAT-S1 (B1): the forms of Settings -> Approvals, -> Routing and -> Rules (plan GAT, D12, D16, D27) are checked and turned into the config.
// Pure: ids and the working day of a date come in through the env, so the result is fixed. Every refusal names its field and one message key.
import { expect, it } from "vitest";
import { nextMeetingDay, parseApprovalsForm, parseFallbackRoleForm, parseRoutingReviewForm, roleOptionsOf, type ParseEnv } from "@/features/approvals/settings-form";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type Council } from "@/features/approvals/types";

const ROLES = [{ id: "role_a" }, { id: "role_b" }, { id: "role_c" }];
const BEFORE: Council[] = [{ id: "k_old", name: "Old council", memberRoleIds: ["role_a"], secretaryRoleId: "role_a", everyDays: 20, firstDay: 100 }];
let n = 0;
const env = (base: ApprovalConfig = EMPTY_APPROVAL_CONFIG): ParseEnv => {
  n = 0;
  return { base, newId: () => `new_${++n}`, dayOfDate: (iso) => (iso === "2027-01-12" ? 500 : iso === "2027-01-10" ? null : 700) };
};

type Entries = [string, string][];
const form = (entries: Entries): FormData => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const FULL: Entries = [
  ["slug", "acme"], ["reviewOn", "on"], ["reviewRole", "role_a"], ["reviewDays", "3"], ["reviewDeputy", "role_b"], ["approvalDays", "7"],
  ["council.0.id", "k_old"], ["council.0.name", "  Investment council "], ["council.0.members", "role_a"], ["council.0.members", "role_b"], ["council.0.secretary", "role_b"], ["council.0.every", "10"], ["council.0.first", "2027-01-12"],
  ["council.1.id", "new-1002"], ["council.1.name", "Safety board"], ["council.1.secretary", "role_c"], ["council.1.every", "5"], ["council.1.first", "2027-02-01"],
  ["rule.0.id", "rule_x"], ["rule.0.approver", "role:role_c"], ["rule.0.route", "safety"], ["rule.0.minEur", "5000"],
  ["rule.1.id", ""], ["rule.1.approver", "council:new-1002"], ["rule.1.route", ""], ["rule.1.minEur", ""],
  ["rule.2.id", "rule_y"], ["rule.2.approver", "council:k_old"], ["rule.2.route", ""], ["rule.2.minEur", "0"],
];
const without = (entries: Entries, prefix: string): Entries => entries.filter(([k]) => !k.startsWith(prefix));
const withField = (entries: Entries, key: string, value: string): Entries => [...entries.filter(([k]) => k !== key), [key, value]];

it("GAT settings form parses a full approvals form", () => {
  const base: ApprovalConfig = { ...EMPTY_APPROVAL_CONFIG, triageRoleId: "role_b", fallbackRoleId: "role_c", review: { ...EMPTY_APPROVAL_CONFIG.review, routes: { safety: "always" } } };
  const out = parseApprovalsForm(form(FULL), ROLES, BEFORE, env(base));
  expect(out).toEqual({
    ok: true,
    value: {
      // The triage role, the fallback role and the route modes are not on this form: they stay as they were.
      triageRoleId: "role_b", fallbackRoleId: "role_c",
      review: { on: true, roleId: "role_a", days: 3, deputyRoleId: "role_b", routes: { safety: "always" } },
      approvalDays: 7,
      // An old council keeps its id, a row added in the browser gets a new one, and a rule that names it follows.
      councils: [
        { id: "k_old", name: "Investment council", memberRoleIds: ["role_a", "role_b"], secretaryRoleId: "role_b", everyDays: 10, firstDay: 500 },
        { id: "new_1", name: "Safety board", memberRoleIds: [], secretaryRoleId: "role_c", everyDays: 5, firstDay: 700 },
      ],
      rules: [
        { id: "rule_x", kind: "role", roleId: "role_c", routeKey: "safety", minEur: 5000 },
        { id: "new_2", kind: "council", councilId: "new_1", routeKey: null, minEur: null },
        { id: "rule_y", kind: "council", councilId: "k_old", routeKey: null, minEur: 0 },
      ],
    },
  });
  // The review off needs no role; blank days are the default, an empty form is the empty config with the stored parts.
  const off = parseApprovalsForm(form([["slug", "acme"]]), ROLES, [], env());
  expect(off).toEqual({ ok: true, value: EMPTY_APPROVAL_CONFIG });
  // A form id that is not an old council's is never kept, and a rule id that repeats gets a new one.
  const forged = parseApprovalsForm(form(withField(withField(withField(FULL, "council.0.id", "somebody_elses"), "rule.2.id", "rule_x"), "rule.2.approver", "role:role_a")), ROLES, BEFORE, env());
  expect(forged.ok && forged.value.councils.map((c) => c.id)).toEqual(["new_1", "new_2"]);
  expect(forged.ok && forged.value.rules.map((r) => r.id)).toEqual(["rule_x", "new_3", "new_4"]);
  expect(roleOptionsOf({ units: [{ id: "u1", key: "u1", name: "Plant", kind: "dept", headcount: 1, parentId: null, sort: 0 }], roles: [{ id: "r1", orgUnitId: "u1", title: "Lead", reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: 0 }] })).toEqual([{ id: "r1", label: "Lead · Plant" }]);
  expect(nextMeetingDay({ firstDay: 100, everyDays: 10 }, 90)).toBe(100);
  expect(nextMeetingDay({ firstDay: 100, everyDays: 10 }, 100)).toBe(100);
  expect(nextMeetingDay({ firstDay: 100, everyDays: 10 }, 101)).toBe(110);
  expect(nextMeetingDay({ firstDay: 100, everyDays: 10 }, 125)).toBe(130);
});

it("GAT settings form refuses each bad field with its key", () => {
  const bad = (entries: Entries) => parseApprovalsForm(form(entries), ROLES, BEFORE, env());
  const refused = (entries: Entries, field: string) => expect(bad(entries), field).toEqual({ ok: false, field, error: "approvals.permConfig" });
  // the review
  refused(withField(FULL, "reviewRole", ""), "reviewRole"); // a review without a role
  refused(withField(FULL, "reviewRole", "role_gone"), "reviewRole");
  refused(withField(FULL, "reviewDeputy", "role_gone"), "reviewDeputy");
  for (const days of ["0", "5", "-1", "2.5", "two"]) refused(withField(FULL, "reviewDays", days), "reviewDays");
  // the approval days
  for (const days of ["0", "31", "x", "1.5"]) refused(withField(FULL, "approvalDays", days), "approvalDays");
  // a council
  refused(withField(FULL, "council.1.secretary", ""), "council.1.secretary"); // without a secretary
  refused(withField(FULL, "council.1.secretary", "role_gone"), "council.1.secretary");
  for (const every of ["4", "61", "", "ten"]) refused(withField(FULL, "council.0.every", every), "council.0.every");
  refused(withField(FULL, "council.0.name", "   "), "council.0.name");
  refused(withField(FULL, "council.0.first", ""), "council.0.first");
  refused(withField(FULL, "council.0.first", "2027-01-10"), "council.0.first"); // not a working day
  refused([...FULL, ["council.0.members", "role_gone"]], "council.0.members");
  // a rule
  refused(withField(FULL, "rule.0.approver", ""), "rule.0.approver"); // without its role or council
  refused(withField(FULL, "rule.0.approver", "role:"), "rule.0.approver");
  refused(withField(FULL, "rule.0.approver", "role:role_gone"), "rule.0.approver");
  refused(withField(FULL, "rule.0.approver", "council:k_gone"), "rule.0.approver");
  refused(withField(FULL, "rule.0.approver", "committee:role_a"), "rule.0.approver");
  refused(withField(without(FULL, "council.0"), "rule.2.approver", "council:k_old"), "rule.2.approver"); // a council removed in the same save
  for (const eur of ["-1", "1.5", "5k", "100000001"]) refused(withField(FULL, "rule.0.minEur", eur), "rule.0.minEur");
  // The first bad field is the one named, in the order of the page.
  expect(bad([...withField(withField(FULL, "reviewDays", "9"), "approvalDays", "99")])).toMatchObject({ field: "reviewDays" });
});

it("GAT settings form parses the triage role and route modes", () => {
  const keys = ["safety", "quality", "machines"];
  const ids = ["role_a", "role_b"];
  const out = parseRoutingReviewForm(form([["slug", "acme"], ["triageRole", "role_a"], ["review.safety", "always"], ["review.quality", "never"], ["review.machines", "company"], ["review.ghost", "always"]]), keys, ids);
  // 'company' is the default and not stored; a route the form names that the company does not have is ignored.
  expect(out).toEqual({ ok: true, value: { triageRoleId: "role_a", routes: { safety: "always", quality: "never" } } });
  expect(parseRoutingReviewForm(form([["slug", "acme"]]), keys, ids)).toEqual({ ok: true, value: { triageRoleId: null, routes: {} } });
  expect(parseRoutingReviewForm(form([["triageRole", "role_gone"]]), keys, ids)).toEqual({ ok: false, field: "triageRole", error: "approvals.permConfig" });
  expect(parseRoutingReviewForm(form([["review.quality", "sometimes"]]), keys, ids)).toEqual({ ok: false, field: "review.quality", error: "approvals.permConfig" });
});

it("GAT settings form parses the fallback role", () => {
  const ids = ["role_a", "role_b"];
  expect(parseFallbackRoleForm(form([["fallbackRole", "role_b"]]), ids)).toEqual({ ok: true, value: "role_b" });
  expect(parseFallbackRoleForm(form([["fallbackRole", ""]]), ids)).toEqual({ ok: true, value: null }); // empty = the first manager role (D16)
  expect(parseFallbackRoleForm(form([]), ids)).toEqual({ ok: true, value: null });
  expect(parseFallbackRoleForm(form([["fallbackRole", "role_gone"]]), ids)).toEqual({ ok: false, field: "fallbackRole", error: "approvals.permConfig" });
});
