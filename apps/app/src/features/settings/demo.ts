// What the settings pages show when this copy of NextUp has no database (local runs, the demo):
// the Acme sample from the designs. Pure data; nothing here is ever saved.
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import type { Knowledge } from "@/features/knowledge";
import type { Member } from "@/features/tenant/members";
import type { CompanyForm, RulesForm } from "./company-forms";

export const SAMPLE_COMPANY: CompanyForm = {
  name: "Acme Automotive GmbH",
  mark: "AA",
  profile: {
    vision: "Every line runs without unplanned stops by 2028.",
    mission: "We build seat frames for four carmakers, on time and with less scrap every year.",
    principles: ["Safety first", "Fix it at the line", "Data over opinion"],
    businessModel: "Tier-1 supplier. Long contracts per car model, priced per part. Margin comes from yield and changeover time.",
    complianceRules: "",
  },
};

export const SAMPLE_RULES: RulesForm = {
  rules: { ...DEFAULT_RULES, promiseDays: 5, outcomeDays: 14, spend: { limitEur: 25000, text: "Above €25k the plant manager approves." } },
  loop: { ...LOOP_DEFAULTS, measureDays: [...LOOP_DEFAULTS.measureDays] },
};

export const SAMPLE_CALENDAR: CalendarSpec = {
  ...DEFAULT_CALENDAR,
  region: "DE-BY",
  extraHolidays: ["2027-02-22", "2027-02-23"],
  extraWorkdays: ["2027-03-13"],
};

/** A small plant: one site, three teams, their leads, a few routes and two goals. */
export const SAMPLE_KNOWLEDGE: Knowledge = {
  units: [
    { id: "u-site", key: "WERK_SUED", name: "Werk Süd", kind: "dept", headcount: 240, parentId: null, sort: 0 },
    { id: "u-asm", key: "ASSEMBLY", name: "Assembly", kind: "team", headcount: 86, parentId: "u-site", sort: 0 },
    { id: "u-qa", key: "QUALITY", name: "Quality", kind: "team", headcount: 18, parentId: "u-site", sort: 1 },
    { id: "u-mnt", key: "MAINTENANCE", name: "Maintenance", kind: "team", headcount: 24, parentId: "u-site", sort: 2 },
  ],
  roles: [
    { id: "r-plant", orgUnitId: "u-site", title: "Plant manager", reportsToId: null, decides: ["budget", "staffing"], spendLimitEur: 25000, skills: [], sort: 0 },
    { id: "r-asm", orgUnitId: "u-asm", title: "Assembly lead", reportsToId: "r-plant", decides: ["line changes"], spendLimitEur: 5000, skills: [], sort: 0 },
    { id: "r-qa", orgUnitId: "u-qa", title: "Quality lead", reportsToId: "r-plant", decides: ["test plans"], spendLimitEur: 5000, skills: [], sort: 0 },
    { id: "r-mnt", orgUnitId: "u-mnt", title: "Maintenance lead", reportsToId: "r-plant", decides: ["spare parts"], spendLimitEur: 5000, skills: [], sort: 0 },
  ],
  holders: [
    { id: "h-1", roleId: "r-plant", name: "Hanna Sander", userId: "demo-hs", sort: 0 },
    { id: "h-2", roleId: "r-asm", name: "Jonas Weber", userId: "demo-jw", sort: 0 },
    { id: "h-3", roleId: "r-qa", name: "Aylin Kaya", userId: "demo-ak", sort: 0 },
    { id: "h-4", roleId: "r-mnt", name: "", userId: null, sort: 0 },
  ],
  rules: [
    { id: "rt-1", key: "safety", type: "Safety, near misses", keywords: ["safety", "injury", "near miss"], ownerRoleId: "r-plant", deputyRoleId: "r-asm", buddyRoleId: null, wait: "1 d", sort: 0 },
    { id: "rt-2", key: "quality", type: "Quality data, measurements", keywords: ["scrap", "defect", "rework", "torque", "gauge"], ownerRoleId: "r-qa", deputyRoleId: "r-plant", buddyRoleId: "r-asm", wait: "2 d", sort: 1 },
    { id: "rt-3", key: "machines", type: "Maintenance, downtime", keywords: ["breakdown", "downtime", "spare part"], ownerRoleId: "r-mnt", deputyRoleId: "r-plant", buddyRoleId: null, wait: "2 d", sort: 2 },
    { id: "rt-4", key: "ideas", type: "Spend under €5k", keywords: ["parts", "tools", "order"], ownerRoleId: "r-asm", deputyRoleId: "r-plant", buddyRoleId: null, wait: "2 d", sort: 3 },
  ],
  goals: [
    { id: "g-1", orgUnitId: null, parentId: null, title: "Scrap rate below 2 %", kpi: "scrap rate", target: "< 2 %", period: "2027", keywords: ["scrap"], sort: 0 },
    { id: "g-2", orgUnitId: "u-asm", parentId: "g-1", title: "OEE 85 %", kpi: "OEE", target: "85 %", period: "Q4 2026", keywords: ["oee"], sort: 0 },
  ],
};

/** The people the sample seats link to. */
export const SAMPLE_MEMBERS: { id: string; name: string }[] = [
  { id: "demo-ak", name: "Aylin Kaya" },
  { id: "demo-hs", name: "Hanna Sander" },
  { id: "demo-jw", name: "Jonas Weber" },
];

/** The sample Members table: who signs in how, and the seats they hold. */
export type SampleMember = Member & { dept: string; codeIssuedAt: string | null; microsoft: boolean; active: boolean; seats: { id: string; label: string }[] };
export const SAMPLE_MEMBER_ROWS: SampleMember[] = [
  { id: "demo-hs", name: "Hanna Sander", email: "h.sander@acme.example", role: "manager", dept: "Werk Süd", codeIssuedAt: "2026-10-12T09:00:00Z", microsoft: false, active: true, seats: [{ id: "h-1", label: "Plant manager" }] },
  { id: "demo-ak", name: "Aylin Kaya", email: "a.kaya@acme.example", role: "leader", dept: "Quality", codeIssuedAt: null, microsoft: true, active: true, seats: [{ id: "h-3", label: "Quality lead" }] },
  { id: "demo-jw", name: "Jonas Weber", email: "j.weber@acme.example", role: "leader", dept: "Assembly", codeIssuedAt: "2026-10-20T09:00:00Z", microsoft: false, active: true, seats: [{ id: "h-2", label: "Assembly lead" }] },
  { id: "demo-df", name: "Dario Ferraro", email: "d.ferraro@acme.example", role: "member", dept: "Assembly", codeIssuedAt: null, microsoft: false, active: true, seats: [] },
  { id: "demo-mk", name: "Mira Keller", email: "m.keller@acme.example", role: "member", dept: "Logistics", codeIssuedAt: null, microsoft: false, active: false, seats: [] },
];

/** The signed-in sample manager, and the seat nobody holds yet. */
export const SAMPLE_ME = "demo-hs";
export const SAMPLE_FREE_SEATS = [{ id: "h-4", label: "Maintenance lead" }];
