// GAT-G1 (B2): the review and approval settings as CompanyRule rows (plan GAT, D16, D27), pure and without a database: the defaults, the
// per-key fallback, every key, the round trip, and what the seed carries (the roles' title and spend limit, the manager user ids).
import { expect, it } from "vitest";
import { APPROVAL_CONFIG_KEYS, approvalConfigRows, parseApprovalConfig } from "@/features/approvals/config";
import { APPROVAL_DAYS_DEFAULT, EMPTY_APPROVAL_CONFIG, REVIEW_DAYS_DEFAULT, type ApprovalConfig } from "@/features/approvals/types";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";
import { COMPANY_RULE_KEYS, DEFAULT_RULES } from "@/features/knowledge/rules";
import { structureSeed, type Knowledge } from "@/features/knowledge";

const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_a", "role_b"], secretaryRoleId: "role_b", everyDays: 10, firstDay: 20 };
const ROWS = [
  { key: "review", value: { on: true, roleId: "role_rev", days: 3, deputyRoleId: "role_dep", routes: { r1: "always", r2: "never", r3: "company" } } },
  { key: "triage_role", value: { roleId: "role_triage" } },
  { key: "fallback_role", value: { roleId: "role_fallback" } },
  { key: "approval_days", value: { days: 7 } },
  { key: "approval_rules", value: [
    { id: "ru1", kind: "role", roleId: "role_fin", routeKey: null, minEur: 5000 },
    { id: "ru2", kind: "council", councilId: "k1", routeKey: "r1", minEur: null },
  ] },
  { key: "councils", value: [COUNCIL] },
];

it("GAT config gives the defaults for no rows", () => {
  const c = parseApprovalConfig([]);
  expect(c).toEqual(EMPTY_APPROVAL_CONFIG);
  expect(c.review).toEqual({ on: false, roleId: null, days: REVIEW_DAYS_DEFAULT, deputyRoleId: null, routes: {} });
  expect(c.approvalDays).toBe(APPROVAL_DAYS_DEFAULT);
  expect(c.rules).toEqual([]);
  expect(c.councils).toEqual([]);
  // The keys stay outside the rules the settings form saves (D7), and rows of other keys are ignored.
  for (const k of APPROVAL_CONFIG_KEYS) expect(COMPANY_RULE_KEYS as readonly string[], k).not.toContain(k);
  expect(parseApprovalConfig([{ key: "promise_days", value: { days: 9 } }])).toEqual(EMPTY_APPROVAL_CONFIG);
  // A parse never hands out the shared empty object.
  c.review.routes.r9 = "always";
  expect(EMPTY_APPROVAL_CONFIG.review.routes).toEqual({});
});

it("GAT config falls back per key on bad values", () => {
  const rows = [
    { key: "review", value: { on: true, roleId: "role_rev", days: 9, deputyRoleId: 5, routes: { r1: "always", r2: "sometimes" } } },
    { key: "triage_role", value: "role_triage" },
    { key: "fallback_role", value: { roleId: "" } },
    { key: "approval_days", value: { days: 99 } },
    { key: "approval_rules", value: [
      { id: "ok", kind: "role", roleId: "role_fin", routeKey: null, minEur: 100 },
      { id: "odd", kind: "committee", roleId: "role_fin", routeKey: null, minEur: null },
      { id: "neg", kind: "role", roleId: "role_fin", routeKey: null, minEur: -1 },
      { id: "nocouncil", kind: "council", routeKey: null, minEur: null },
      "not a rule",
    ] },
    { key: "councils", value: [{ ...COUNCIL, everyDays: 3 }, { ...COUNCIL, id: "k2", memberRoleIds: "all" }, COUNCIL] },
  ];
  const c = parseApprovalConfig(rows);
  expect(c.review).toEqual({ on: true, roleId: "role_rev", days: REVIEW_DAYS_DEFAULT, deputyRoleId: null, routes: { r1: "always" } }); // review days 9 -> 2
  expect(c.triageRoleId).toBeNull();
  expect(c.fallbackRoleId).toBeNull();
  expect(c.approvalDays).toBe(APPROVAL_DAYS_DEFAULT);
  expect(c.rules.map((r) => r.id)).toEqual(["ok"]); // an unknown kind, a bad amount and a missing council are dropped
  expect(c.councils).toEqual([COUNCIL]); // everyDays 3 is dropped, so is a bad member list
  expect(parseApprovalConfig([{ key: "review", value: null }, { key: "councils", value: { id: "k1" } }, { key: "approval_rules", value: 3 }])).toEqual(EMPTY_APPROVAL_CONFIG);
});

it("GAT config reads every key", () => {
  const c = parseApprovalConfig(ROWS);
  expect(c.review).toEqual({ on: true, roleId: "role_rev", days: 3, deputyRoleId: "role_dep", routes: { r1: "always", r2: "never", r3: "company" } });
  expect(c.triageRoleId).toBe("role_triage");
  expect(c.fallbackRoleId).toBe("role_fallback");
  expect(c.approvalDays).toBe(7);
  expect(c.rules).toEqual([
    { id: "ru1", kind: "role", roleId: "role_fin", routeKey: null, minEur: 5000 },
    { id: "ru2", kind: "council", councilId: "k1", routeKey: "r1", minEur: null },
  ]);
  expect(c.councils).toEqual([COUNCIL]);
  // An unknown role id is kept: it is ignored where it is used, never here.
  expect(parseApprovalConfig([{ key: "triage_role", value: { roleId: "role_gone" } }]).triageRoleId).toBe("role_gone");
});

it("GAT config round-trips approvalConfigRows", () => {
  const c = parseApprovalConfig(ROWS);
  const rows = approvalConfigRows(c);
  expect(rows.map((r) => r.key)).toEqual([...APPROVAL_CONFIG_KEYS]);
  expect(parseApprovalConfig(rows)).toEqual(c);
  // Every key is written, also for the empty config, and the rows are plain JSON.
  const empty = approvalConfigRows(EMPTY_APPROVAL_CONFIG);
  expect(empty.map((r) => r.key)).toEqual([...APPROVAL_CONFIG_KEYS]);
  expect(parseApprovalConfig(JSON.parse(JSON.stringify(empty)))).toEqual(EMPTY_APPROVAL_CONFIG);
  // Rows are copies: changing them does not change the config.
  (rows[0].value as { routes: Record<string, string> }).routes.zz = "always";
  expect(c.review.routes.zz).toBeUndefined();
});

const KNOWLEDGE: Knowledge = {
  units: [{ id: "u1", key: "u1", name: "Plant", kind: "department", headcount: 10, parentId: null, sort: 0 }],
  roles: [
    { id: "role_boss", orgUnitId: "u1", title: "Plant manager", reportsToId: null, decides: [], spendLimitEur: 50_000, skills: [], sort: 0 },
    { id: "role_lead", orgUnitId: "u1", title: "Team lead", reportsToId: "role_boss", decides: [], spendLimitEur: null, skills: [], sort: 1 },
  ],
  holders: [{ id: "h1", roleId: "role_boss", name: "K. Head", userId: "u_head", sort: 0 }],
  rules: [], goals: [],
};

it("GAT config gives roles with title and spendLimitEur", () => {
  const seed = structureSeed({ ...SEED, approvals: parseApprovalConfig(ROWS) }, KNOWLEDGE, DEFAULT_RULES);
  expect(seed.roles).toEqual([
    { id: "role_boss", orgUnitId: "u1", reportsToId: null, title: "Plant manager", spendLimitEur: 50_000 },
    { id: "role_lead", orgUnitId: "u1", reportsToId: "role_boss", title: "Team lead", spendLimitEur: null },
  ]);
  // reduce() copies the seed's config and the roles (as ApprovalRoleInfo) into State.approvals.
  const state = reduce(seed, emptyLog());
  expect(state.approvals.roles).toEqual([
    { id: "role_boss", title: "Plant manager", reportsToId: null, spendLimitEur: 50_000 },
    { id: "role_lead", title: "Team lead", reportsToId: "role_boss", spendLimitEur: null },
  ]);
  expect(state.approvals.review.roleId).toBe("role_rev");
});

it("GAT config carries the manager user ids", () => {
  // companySeed sets managerUserIds from the people with the app role manager (tests/db/gat-seed.test.ts); structureSeed leaves them alone.
  const config: ApprovalConfig = parseApprovalConfig(ROWS);
  const seed = structureSeed({ ...SEED, approvals: config, managerUserIds: ["u_boss", "u_chef"] }, KNOWLEDGE, DEFAULT_RULES);
  expect(seed.managerUserIds).toEqual(["u_boss", "u_chef"]);
  expect(seed.approvals).toBe(config);
  // The demo seed has neither: the empty config and no managers (D8).
  expect(SEED.approvals).toBeUndefined();
  expect(SEED.managerUserIds).toBeUndefined();
  expect(reduce(SEED, emptyLog()).approvals).toEqual({ ...EMPTY_APPROVAL_CONFIG, roles: [] });
});
