// The demo company's knowledge beyond the org chart: profile and compliance rules, goals with KPIs,
// what each role may decide, and the documents an ERP/n8n import would bring in. Made up, like the
// rest of the demo (Acme Maschinenbau GmbH: sensor housings and test rigs, ~500 people, automotive
// supplier). Pure data. Used by prisma/seed.ts for the database and by the raise-page assistant
// when there is no database, so both answer from the same facts. docs/ASSISTANT.md.
import type { InboundDocument } from "@/features/assist/documents";
import type { Knowledge, Profile } from "@/features/knowledge";

export const DEMO_PROFILE: Profile = {
  vision: "Every test rig and sensor housing we ship works first time at the customer's line.",
  mission: "We build pressure-sensor housings and end-of-line test rigs for automotive tier-1 suppliers, and we fix what slows our own people down within two working days.",
  principles: [
    "Decide at the lowest level that has the facts.",
    "A problem raised is a gift, not a complaint.",
    "No line stops waiting for a signature.",
    "Customer data and prototype data stay with the people who need them.",
  ],
  businessModel: "Series production of sensor housings (4-series) under framework contracts, plus project business for test rigs and field service contracts. Revenue 2025: about €84 m; 500 people at two sites (Esslingen, Brno).",
};

/** What the demo company's admins told the assistant. Shown in /admin, put into the prompt. */
export const DEMO_COMPLIANCE_RULES = [
  "Never name customers or customer programmes; say \"a customer\" instead.",
  "Prototype and drawing data is TISAX-protected: point to the Engineering lead instead of describing it.",
  "Export-controlled topics (dual-use, sanctions lists) go to the CFO's office - do not answer them.",
  "No statements about individual people's performance, health or pay; point to HR services.",
  "Safety issues (injury risk, machine guarding) are always raised at once and reported to the shift lead.",
].join("\n");

const GOAL_DETAIL: Record<string, { kpi: string; target: string; period: string }> = {
  "No line stops waiting for a signature": { kpi: "line-stop minutes waiting for approval", target: "0 per month", period: "2026" },
  "Scrap and rework on the 4-series down 20 %": { kpi: "scrap + rework rate, 4-series", target: "3.1 % (from 3.9 %)", period: "2026" },
  "Every changeover under 20 minutes": { kpi: "median changeover time, lines 1-4", target: "< 20 min (today 34 min)", period: "Q4 2026" },
  "New hires productive in week one": { kpi: "days until a new hire has all logins and a trained station", target: "≤ 5 working days", period: "2026" },
};

const ROLE_DETAIL: Record<string, { decides: string[]; spendLimitEur: number | null; skills: string[] }> = {
  "Managing director": { decides: ["strategy", "hiring above team lead", "spend over €50k"], spendLimitEur: null, skills: ["P&L", "customer escalations"] },
  "Head of Production": { decides: ["shift model", "line investments", "overtime budget"], spendLimitEur: 50000, skills: ["lean", "OEE", "capacity planning"] },
  "CFO": { decides: ["budgets", "supplier contracts", "export control"], spendLimitEur: 50000, skills: ["controlling", "customs and export control"] },
  "Engineering lead": { decides: ["test-rig bookings", "design changes", "IT access for engineering tools"], spendLimitEur: 20000, skills: ["test rigs", "firmware", "PLM"] },
  "Quality lead": { decides: ["release and block of lots", "tolerance deviations", "customer change notes"], spendLimitEur: 10000, skills: ["IATF 16949", "measurement systems", "8D"] },
  "Ops & Admin lead": { decides: ["facilities", "purchasing process", "office equipment"], spendLimitEur: 10000, skills: ["purchasing", "facilities"] },
  "IT service lead": { decides: ["accounts and access", "laptops", "software licences"], spendLimitEur: 10000, skills: ["identity and access", "TISAX ISMS"] },
  "Team lead, 4-series": { decides: ["spend under €5k for the line", "shift plan", "fixtures and tooling on lines 1-4"], spendLimitEur: 5000, skills: ["4-series process", "changeover", "shift planning"] },
  "Sales lead": { decides: ["quotes", "delivery promises"], spendLimitEur: 10000, skills: ["key accounts"] },
  "Field Service lead": { decides: ["service visits", "spare-part shipments"], spendLimitEur: 10000, skills: ["rig commissioning"] },
  "HR services": { decides: ["onboarding plans", "working-time questions"], spendLimitEur: null, skills: ["labour law basics", "onboarding"] },
};

/** The rows from the seed, with the KPIs, targets and decision rights filled in. */
export function withDemoDetail(k: Knowledge): Knowledge {
  return {
    ...k,
    goals: k.goals.map((g) => ({ ...g, ...(GOAL_DETAIL[g.title] ?? {}) })),
    roles: k.roles.map((r) => ({ ...r, ...(ROLE_DETAIL[r.title] ?? {}) })),
  };
}

const doc = (externalId: string, title: string, body: string, classification: InboundDocument["classification"] = "internal", source = "erp"): InboundDocument =>
  ({ source, externalId, title, body, classification });

/** What a nightly ERP / n8n import would bring in. One is confidential: the assistant must not see it. */
export const DEMO_DOCUMENTS: InboundDocument[] = [
  doc("PROC-001", "Ordering parts and tools under €5k", "Parts, tools and consumables under €5,000 are ordered by the team lead of the line directly in SAP (transaction ME21N, purchasing group P40). No controlling sign-off is needed below €5,000. Above €5,000 the Head of Production approves; above €50,000 the managing director. Standard suppliers are in the frame-contract list in SAP; a new supplier needs Ops & Admin to create it first (about 3 working days)."),
  doc("MAT-4711", "Spare pressure sensors for test rigs", "Each test rig keeps two spare pressure sensors (material 4711-PS-10, 0-10 bar) in cabinet B2 next to rig 3. Take one, then book it in SAP with movement type 201 on the rig's cost centre 4410. Stock below 4 in total triggers a reorder automatically; delivery takes 6 working days."),
  doc("PROC-014", "Booking test-rig time", "Test rigs 1-4 are booked in the rig calendar in the engineering SharePoint. Slots are 4 hours. Validation runs for customer releases have priority; endurance runs are scheduled at night and at weekends. Conflicts go to the Engineering lead, who decides within 4 working days."),
  doc("PROC-021", "Changeover standard, lines 1-4", "Changeover follows SMED sheet CS-4 (laminated at each line). Fixtures are prepared on the pre-set table while the line still runs. Target: under 20 minutes; today's median is 34 minutes. The most common delay is a missing fixture: fixtures are stored in rack F, one slot per product variant, and must be returned cleaned. Missing or damaged fixtures are reported to the team lead, 4-series.", "internal", "upload"),
  doc("QUA-008", "Tolerance deviation and lot block", "If a measurement is out of tolerance, stop and mark the lot with a red tag. Enter a deviation in the MES (menu Quality > Deviation). The Quality lead releases or blocks the lot within 2 working days. Rework instructions are only valid when signed by Quality. Measurement drift on the CMM is checked every Monday; report sudden drift at once."),
  doc("IT-003", "New starter accounts and laptops", "HR services opens a ticket in the IT portal two weeks before the start date. IT prepares the laptop, Windows account, SAP role and MES login. The team lead requests line-specific tool access in the same ticket. Target: everything ready on day one. Password resets: IT portal self-service or the IT hotline, extension 2200."),
  doc("HR-012", "Overtime and shift swaps", "Shift swaps are agreed between colleagues and entered in the shift plan by the team lead at least 24 hours before. Overtime needs the team lead's approval in advance and is recorded in the time system the same day. The works agreement BV-07 limits overtime to 20 hours per month per person.", "internal", "upload"),
  doc("SAF-001", "Reporting a safety issue", "Any injury risk (missing guard, oil on the floor, faulty light curtain) is reported at once to the shift lead and entered in the safety app. Machines with a missing guard are locked out (LOTO) before anything else. Near misses are reported too; they are never used against the person who reports them.", "public", "upload"),
  doc("PROC-030", "Customer change notes and firmware releases", "Any change that reaches a customer (firmware, housing material, test limits) needs a change note approved by the Quality lead and sent to the customer before shipping. Sales informs the key account. Emergency firmware fixes still need the change note, filed within 24 hours."),
  doc("FAC-002", "Lighting, lockers and facilities", "Broken lights, lockers, doors and heating are reported in the facilities app or to Ops & Admin (extension 2100). Standard repairs are done within 3 working days; anything that is a safety risk the same day."),
  doc("KPI-2026", "Company goals 2026", "1) No line stops waiting for a signature (0 minutes/month). 2) Scrap and rework on the 4-series down 20 % to 3.1 %. 3) Every changeover under 20 minutes by Q4 2026. 4) New hires productive in week one. Progress is reviewed monthly in the site meeting."),
  doc("FIN-077", "Supplier price agreements 2026", "Negotiated prices per supplier and material group, including the frame contract for pressure sensors and housing castings. Confidential: purchasing and finance only.", "confidential"),
];

const WORD = /[\p{L}\p{N}]{3,}/gu;
// Words that match everything and mean nothing to a search.
const STOP = new Set(("the and for how who what when where with does need can get our are you not this that from have has " +
  "der die das und wie wer was wann wo mit für ich wir ist sind ein eine den dem nicht").split(" "));

/**
 * The demo documents searched without a database - the same idea as the Postgres full-text search
 * (words in common, prefix match), good enough for a demo. Respects the ceiling like the real one.
 */
export function searchDemoDocuments(query: string, allowed: (classification: string) => boolean, limit = 4) {
  const q = [...new Set(query.toLowerCase().match(WORD) ?? [])].filter((w) => !STOP.has(w));
  if (!q.length) return [];
  return DEMO_DOCUMENTS
    .filter((d) => allowed(d.classification))
    .map((d) => {
      const words = (d.title + " " + d.body).toLowerCase().match(WORD) ?? [];
      const hits = q.filter((w) => words.some((x) => x.startsWith(w))).length;
      return { d, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(({ d }) => ({ id: d.externalId, title: d.title, snippet: d.body.slice(0, 700), classification: d.classification, source: d.source }));
}
