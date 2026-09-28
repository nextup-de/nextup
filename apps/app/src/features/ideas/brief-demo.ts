// Written AI briefs for the demo seed's ideas awaiting a decision (i1, i2, i6), from the Claude
// Design inbox handoff. People are the seed's own (features/demo/seed.ts PEOPLE), so a chip or
// a comment always points at someone on the org chart; figures follow each idea's seed fields.
// Keyed by idea id; briefFor() in brief.ts turns one into what the inbox renders.
import type { Block, Source, WrittenBrief } from "./brief";

const text = (h: string, p: string, c: string[]): Block => ({ t: "text", h, p, c });
const facts = (items: [string, string, string[]][]): Block => ({ t: "facts", items: items.map(([k, v, c]) => ({ k, v, c })) });
const steps = (items: [string, string, string][], c: string[]): Block => ({ t: "steps", c, items: items.map(([label, owner, dur]) => ({ label, owner, dur })) });
const compare = (title: string, rows: [string, number, string, boolean?][], c: string[]): Block =>
  ({ t: "compare", title, c, rows: rows.map(([label, value, display, us]) => ({ label, value, display, us })) });
const quote = (h: string, q: string, who: string, role: string, c: string[]): Block => ({ t: "quote", h, q, who, role, c });
const src = (name: string, where: string, ext: Source["ext"]): Source => ({ name, where, ext });

// Sources more than one brief cites.
const SHARED = {
  goals: src("Company goals 2026", "SharePoint · Leadership", "PDF"),
  ideas: src("Related ideas this quarter", "Fresh ideas archive", "IDEA"),
  arch: src("1,240 past ideas, 2024–2026", "Fresh ideas archive", "IDEA"),
  cmts: src("Comments on this idea", "Fresh ideas · this thread", "IDEA"),
} satisfies Record<string, Source>;

const SPEND: WrittenBrief = {
  description: "Let team leads approve spend up to €5k without department and finance sign-off. Today a €900 tool purchase needs three approvals and waits twelve working days. Finance keeps visibility through the existing monthly card reports.",
  context: "We tracked every purchase under €5k in Operations from March to August: 212 requests, a median wait of twelve working days, and in 9 cases the tool was no longer needed by the time it was approved. The slowest step is the department head sign-off, because heads batch approvals weekly. Finance sign-off adds another three to four days, and in 94% of cases finance approves without changes. The two pilot sites have run with a standing €5k authority for a quarter: no budget overrun, and lead time down to two days.",
  prompts: [
    { label: "Solves", text: "Three approval steps for spend under €5k" },
    { label: "Impact", text: "Around 1,400 approval steps a year across 38 teams, roughly 2,100 hours of waiting, and fewer split orders that confuse the monthly reporting" },
    { label: "Who’s blocked", text: "Team leads, maintenance crews waiting on spare parts, IT waiting on licences, new hires waiting on equipment" },
    { label: "Already tried", text: "A finance fast lane in 2024, never staffed. Higher card limits in 2025, which led to split orders above €500." },
    { label: "Deadline", text: "Before Q1 budgets are set in November, so limits can be configured per team for 2027" },
  ],
  files: [
    { name: "approval-times-mar-aug.xlsx", size: "84 KB" }, { name: "card-report-august.pdf", size: "1.2 MB" },
    { name: "split-orders-analysis.xlsx", size: "132 KB" }, { name: "spend-policy-draft-v2.docx", size: "46 KB" },
    { name: "pilot-sites-q3-report.pdf", size: "780 KB" },
  ],
  categories: ["Operations", "All sites", "Approval process"],
  affects: {
    depts: ["OPS", "FIN", "HIT", "ENG", "PRD"], people: ["R. Nowak", "K. Adler", "L. Brandt", "B. Hartmann"],
    ai: ["HIT", "ENG", "K. Adler"],
    why: { HIT: "Software licences are the most common purchase under €5k.", ENG: "Engineering buys small test parts and tools every week.", "K. Adler": "The CFO signs off changes to the spending policy." },
  },
  scores: [
    { value: 80, note: "Removes around 1,400 approval steps a year across 38 teams.", blocks: [
      text("Where the time goes", "The ERP shows 212 purchase requests under €5k between March and August, with a median wait of twelve working days. The department head sign-off alone takes five of those days, and finance changes almost nothing. Across 38 teams that is around 1,400 approval steps and 2,100 hours of waiting a year.", ["erp", "log", "hr"]),
      compare("Lead time for purchases under €5k", [["Us today", 12, "12 days", true], ["Industry median", 3.5, "3–4 days"], ["Pilot sites", 2, "2 days"]], ["ext1", "pilot"]),
      quote("From the team lead interviews", "We borrow parts from the line next door because a €300 order takes two weeks.", "T. Vogel", "Team lead, 4-series", ["intv"]),
    ] },
    { value: 90, note: "The ERP and card platform already support limits per role. This is a configuration change.", blocks: [
      text("Why it is simple", "This is a configuration change, not a project. The ERP and the card platform already support limits per role, and the two pilot sites have run it for a quarter. The policy draft is written. Limits must be set before Q1 budgets lock in November.", ["erp", "pilot", "policy", "budget"]),
      steps([["CFO signs off policy v2", "K. Adler", "1 week"], ["IT sets limits per team in the ERP", "L. Brandt", "6 days"], ["Roll out team by team", "Operations", "90 days"]], ["erp"]),
    ] },
    { value: 90, note: "No new tooling. About two days of finance setup.", blocks: [
      facts([["New spend", "None. No tooling or licences", ["goals"]], ["Setup", "About 2 days of finance time", ["fte", "pilot"]], ["Ongoing", "2 h a month for the spend review", ["card"]], ["Freed up", "24 h a month of finance time", ["fte"]]]),
    ] },
    { value: 70, note: "Supports the 2026 goal that no line stops waiting for a signature.", blocks: [
      text("How it lines up", "The idea serves the 2026 goal that no line stops waiting for a signature, and 31 of 38 team leads already own a budget. Four other ideas this quarter point at the same bottleneck.", ["goals", "hr", "ideas"]),
    ] },
    { value: 60, note: "Moderate. A monthly spend review is needed to catch misuse.", blocks: [
      text("What could go wrong", "Removing finance sign-off takes away a visible control, and weak controls on decentralised spend are already a medium risk in the register. In practice the current step catches little: finance approved 94% of requests unchanged.", ["risk", "erp"]),
      facts([["Elsewhere", "Misuse stays under 1% of spend with monthly reviews", ["ext4"]], ["To reduce it", "Review the first monthly report per team with the CFO before the second site joins", ["ext3"]]]),
    ] },
  ],
  summary: "Raise the approval limit for team leads to €5k. The idea targets slow, low-value purchases that now need three sign-offs. The main benefit is speed; the open question is how finance keeps oversight.",
  lead: "A €900 tool purchase needs three sign-offs and waits twelve working days. Finance changes almost nothing along the way: 94% of requests go through unchanged.",
  bars: { title: "Lead time for purchases under €5k", rows: [{ label: "Us today", value: 12, display: "12 days" }, { label: "Industry median", value: 3.5, display: "3–4 days" }, { label: "Pilot sites", value: 2, display: "2 days" }], note: "The two pilot sites already answer six times faster." },
  after: "The systems already support limits per role, and the pilot sites show it works. The open question is control: a monthly spend review per team would replace the sign-off.",
  rec: "approve",
  recText: "The pilot has already run for a quarter without an overrun. Approve the rollout beyond the two pilot sites, with a monthly spend report per team to finance.",
  next: "Approve, and ask K. Adler to sign policy v2 so IT can set the limits.",
  by: "Mid-October, so limits are in place before budgets lock in November",
  timeline: { title: "Timeline to the budget lock", steps: [{ when: "Oct", what: "Your answer", now: true }, { when: "Oct", what: "Policy signed" }, { when: "Nov", what: "Limits set in the ERP" }, { when: "Jan", what: "All teams live" }] },
  questions: ["Which teams go first after the pilot sites, and why those?", "Is finance happy with a monthly review instead of the sign-off?", "What happens if a team goes over its limit?"],
  pattern: "Four other ideas this quarter name approval steps as the bottleneck, across Operations, IT and Production. All four were raised in the last three months.",
  similar: [
    { title: "Raise purchase card limits for maintenance", where: "Production · 2025", status: "Approved", match: 82, note: "Card limits went up in 2025. Misuse stayed below 1%, but orders above €500 started being split." },
    { title: "Skip finance sign-off below €1k", where: "Logistics · 2024", status: "Declined", match: 74 },
  ],
  routing: [
    { name: "R. Nowak", role: "Cost-centre lead", why: "Owns the approval policy and would run the monthly spend review. He has seen the draft." },
    { name: "K. Adler", role: "CFO", why: "Signs changes to the spending policy. Her signature is what the idea has been waiting on." },
  ],
  cites: { summary: ["erp", "log"], lead: ["erp", "log"], bars: ["ext1", "pilot"], after: ["erp", "pilot", "budget"], rec: ["risk", "pilot"], pattern: ["ideas"], similar: ["pilot"] },
  sources: {
    ...SHARED,
    erp: src("Purchase requests under €5k, Mar–Aug 2026", "ERP · Operations", "DATA"),
    log: src("approval-times-mar-aug.xlsx", "Attached by C. Ilg", "XLSX"),
    hr: src("Team lead roles and cost centres", "HR system", "DATA"),
    budget: src("Budget calendar 2027", "Finance intranet", "PDF"),
    risk: src("Enterprise risk register, Q3 2026", "SharePoint · Risk management", "XLSX"),
    policy: src("spend-policy-draft-v2.docx", "Attached by C. Ilg", "DOCX"),
    pilot: src("pilot-sites-q3-report.pdf", "Attached by C. Ilg", "PDF"),
    card: src("card-report-august.pdf", "Attached by C. Ilg", "PDF"),
    fte: src("Finance time tracking, Q2 2026", "HR system · Time", "DATA"),
    intv: src("Interviews with 6 team leads", "AI interview summaries · Sept 2026", "DOCX"),
    ext1: src("Procurement cycle times, mid-size manufacturers", "Industry benchmark study · 2025", "WEB"),
    ext3: src("Guidance on delegated spend controls", "Audit association · 2024", "WEB"),
    ext4: src("Purchase card misuse in manufacturing", "Industry survey · 2025", "WEB"),
  },
  feed: { supporters: 42, sentiment: "Mostly positive. Finance is open to it with a monthly report.", comments: [
    { name: "L. Brandt", role: "IT service lead", text: "Same for us. Software licences under €2k take weeks.", daysAgo: 2 },
    { name: "R. Nowak", role: "Cost-centre lead", text: "Open to it if we keep a monthly report per team.", daysAgo: 4 },
    { name: "B. Ehlers", role: "HR services", text: "Would help onboarding kits get ordered on time.", daysAgo: 6 },
  ] },
};

const RIG: WrittenBrief = {
  description: "Reserve one day a week (20%) of test-rig time for experiments that are not tied to a customer project. The rig is booked six weeks out, so new ideas wait or get tested at weekends.",
  context: "Since January, 14 internal experiments were postponed because the rig was fully booked. Three of them were later picked up by a competitor first. Four ideas in the queue today need rig time before anyone can say whether they work.",
  prompts: [
    { label: "Solves", text: "Test rig booked out six weeks ahead" },
    { label: "Impact", text: "Unblocks four queued ideas, and 6 to 8 more validated each quarter" },
    { label: "Who’s blocked", text: "Engineers with improvement ideas that need rig validation" },
    { label: "Already tried", text: "Weekend slots. Two engineers did it for a month; not sustainable." },
    { label: "Deadline", text: "The rig schedule for Q1 is set in October" },
  ],
  files: [{ name: "rig-bookings-2026.xlsx", size: "118 KB" }, { name: "postponed-experiments.pdf", size: "360 KB" }],
  categories: ["Engineering", "Test rig", "Capacity"],
  affects: {
    depts: ["ENG", "QUA", "PRD"], people: ["H. Sander", "B. Hartmann"], ai: ["QUA", "PRD", "B. Hartmann"],
    why: { QUA: "Quality runs measurement trials on the same rig.", PRD: "Series validation for Production loses a fifth of the rig.", "B. Hartmann": "Owns the series validation schedule that would move." },
  },
  scores: [
    { value: 70, note: "Validates 6 to 8 improvement ideas faster each quarter.", blocks: [
      text("What is being lost", "Since January, 14 internal experiments were postponed because the rig was fully booked. Three of them were later picked up by a competitor first.", ["post", "rig"]),
      facts([["Postponed", "14 experiments since January", ["post"]], ["Lost", "3 to a competitor", ["post"]], ["Queued", "4 ideas waiting on rig time", ["ideas"]]]),
    ] },
    { value: 60, note: "Two series validation runs would need rescheduling.", blocks: [
      text("What it would take", "The rig is booked six weeks ahead. Holding one fixed day a week means moving two series validation runs by about a week each.", ["rig", "prog"]),
      quote("From the comments", "Fine by me if it is a fixed day we can plan around.", "H. Sander", "Quality lead", ["cmts"]),
    ] },
    { value: 50, note: "About €60k a year in lost billable rig time.", blocks: [
      facts([["Lost billing", "About €60k a year of rig time", ["rate"]], ["New spend", "None", ["rig"]], ["Break-even", "One validated idea a year worth more than €60k", ["goals"]]]),
    ] },
    { value: 80, note: "Directly supports the 2026 innovation target.", blocks: [
      text("How it lines up", "The 2026 goals ask Engineering to validate twice as many ideas. Rig capacity has come up in three ideas since June.", ["goals", "ideas"]),
    ] },
    { value: 70, note: "Low technical risk. Delivery dates need watching.", blocks: [
      text("What could go wrong", "Technical risk is low. The real risk is delivery: if a series run slips, the fixed day becomes the first thing people want back.", ["prog"]),
      facts([["To reduce it", "Review the slot after one quarter with Production", ["prog"]]]),
    ] },
  ],
  summary: "Protect a fixed share of test-rig capacity for internal experiments. It trades some billable time for faster learning on new ideas.",
  lead: "The test rig is booked six weeks ahead. Since January, 14 internal experiments were postponed, and three were later picked up by a competitor first.",
  bars: { title: "Internal experiments since January", rows: [{ label: "Postponed", value: 14, display: "14" }, { label: "Lost to competitor", value: 3, display: "3" }], note: "From the attached list of postponed experiments." },
  after: "Holding one day a week costs about €60k a year in billable rig time and means moving two series validation runs by a week.",
  rec: "info",
  recText: "Ask for the list of experiments that would use the slot, and the effect on current validation dates, before deciding.",
  next: "Ask M. Roth which experiments would use the slot and how the series runs would move.",
  by: "Mid-October, before Q1 rig planning",
  questions: ["Which experiments would go first?", "What happens if a series run slips?"],
  pattern: "Rig and lab capacity has come up in three ideas since June. Lab capacity is a theme in Engineering and Quality.",
  similar: [{ title: "Shared rig calendar across sites", where: "Engineering · 2025", status: "In progress", match: 68, note: "It may free some capacity, but not a fixed day." }],
  routing: [{ name: "H. Sander", role: "Quality lead", why: "Quality books the same rig, and both teams must agree the reserved slot." }],
  cites: { summary: ["rig", "post"], lead: ["post"], bars: ["post"], after: ["rate", "prog"], rec: ["prog"], pattern: ["arch"], similar: ["prog"] },
  sources: {
    ...SHARED,
    rig: src("rig-bookings-2026.xlsx", "Attached by M. Roth", "XLSX"),
    post: src("postponed-experiments.pdf", "Attached by M. Roth", "PDF"),
    rate: src("Rig billing rates 2026", "ERP · Engineering", "DATA"),
    prog: src("Series validation schedule, Q4–Q1", "Planning · Production", "DATA"),
  },
  feed: { supporters: 27, sentiment: "Positive in Engineering. Production is cautious.", comments: [
    { name: "H. Sander", role: "Quality lead", text: "Fine by me if it is a fixed day we can plan around. Could we use part of it for measurement trials?", daysAgo: 1 },
    { name: "B. Hartmann", role: "Head of Production", text: "Only if the series runs keep their dates.", daysAgo: 2 },
  ] },
};

const RECORD: WrittenBrief = {
  description: "Move all measurement data into one system instead of three: the MES and two Access databases. Auditors and engineers spend hours matching records by hand.",
  context: "For the last ISO audit, two engineers spent nine days matching measurement IDs between MES exports and the Access databases. We found 140 records that existed in only one system. Four other ideas need trustworthy quality data before they can start.",
  prompts: [
    { label: "Solves", text: "Quality data lives in three systems" },
    { label: "Impact", text: "About 96 hours a month saved on reconciling, and audit prep in days instead of weeks" },
    { label: "Who’s blocked", text: "Quality engineers and auditors before every audit, and four ideas that need clean data" },
    { label: "Already tried", text: "A weekly export script. It breaks whenever the Access databases change." },
    { label: "Deadline", text: "Next external audit in March 2027" },
  ],
  files: [{ name: "audit-prep-hours-2025.pdf", size: "640 KB" }, { name: "record-mismatch-sample.xlsx", size: "152 KB" }, { name: "current-data-flow.png", size: "980 KB" }],
  categories: ["Quality", "All lines", "Data"],
  affects: {
    depts: ["QUA", "PRD", "HIT"], people: ["L. Brandt", "T. Vogel", "M. Roth"], ai: ["HIT", "L. Brandt"],
    why: { HIT: "IT owns the MES and its capacity is the constraint.", "L. Brandt": "Leads IT service, which would run the migration." },
  },
  scores: [
    { value: 80, note: "Saves about 96 hours a month on reconciling.", blocks: [
      text("Where the time goes", "For the last ISO audit, two engineers spent nine days matching measurement IDs between MES exports and the Access databases. 140 records existed in only one system.", ["ahrs", "mis"]),
      compare("Hours of prep per ISO audit", [["Today", 144, "144 h", true], ["With one record", 30, "~30 h"]], ["ahrs"]),
    ] },
    { value: 50, note: "Six years of lab data would need migrating.", blocks: [
      text("What it would take", "Six years of data need moving into the MES. IT is the constraint, not the approach: the team is booked on the MES upgrade next year, so the work could ride along with it.", ["mes", "road"]),
      steps([["Map fields across MES and both databases", "L. Brandt", "4 weeks"], ["Migrate six years of data", "IT", "10 weeks"], ["Retire the Access databases", "H. Sander", "2 weeks"]], ["mes"]),
    ] },
    { value: 40, note: "About €240k including integration.", blocks: [
      facts([["Integration", "€150k", ["mes"]], ["Migration", "€60k", ["ext6"]], ["Training", "€30k", ["mes"]], ["Total", "€240k, less if bundled with the MES upgrade", ["road"]]]),
    ] },
    { value: 90, note: "Named in the IT roadmap, and moves the scrap-rate KPI.", blocks: [
      text("How it lines up", "One measurement record is named in the 2026–2027 IT roadmap, and the scrap-rate goal needs data people trust. Data spread over several systems is the most common problem in Quality ideas this year.", ["road", "goals", "ideas"]),
    ] },
    { value: 50, note: "Migration risk during audit season.", blocks: [
      text("What could go wrong", "A migration during audit season could leave records in two places at the worst moment. Similar lab migrations often run over by a third.", ["iso", "ext6"]),
      facts([["To reduce it", "Migrate after the spring audit and keep the old databases read-only for a year", ["iso"]]]),
    ] },
  ],
  summary: "Consolidate quality measurements into a single record. High value and strong fit, but a sizeable project that competes for IT time with the planned MES upgrade.",
  lead: "Measurement data lives in three systems. For the last ISO audit, two engineers spent nine days matching records by hand.",
  bars: { title: "Hours of prep per ISO audit", rows: [{ label: "Today", value: 144, display: "144 h" }, { label: "With one record", value: 30, display: "~30 h" }], note: "140 records existed in only one system." },
  after: "It is a sizeable project, around €240k. But IT is already planning an MES upgrade, and this could ride along with it.",
  rec: "route",
  recText: "Route to IT for a sizing estimate. The idea overlaps with the planned MES upgrade and could ride along with it.",
  next: "Ask L. Brandt to size this as part of the MES upgrade.",
  by: "Before the MES upgrade scope is fixed in November",
  questions: ["Which data could stay in the old databases for now?", "Can the migration wait until after the spring audit?"],
  pattern: "It is the most common problem named in Quality ideas this year.",
  similar: [
    { title: "Retire the lab spreadsheets", where: "Quality · 2025", status: "Parked", match: 88, note: "Parked in 2025 because there was no system to move to. The MES upgrade changes that." },
    { title: "Single source for supplier certificates", where: "Quality · 2026", status: "Under review", match: 71 },
  ],
  routing: [{ name: "L. Brandt", role: "IT service lead", why: "Owns the MES roadmap and can size this as part of the upgrade." }],
  cites: { summary: ["ahrs", "mis"], lead: ["ahrs", "mis"], bars: ["ahrs"], after: ["mes", "road"], rec: ["mes"], pattern: ["arch"], similar: ["road"] },
  sources: {
    ...SHARED,
    ahrs: src("audit-prep-hours-2025.pdf", "Attached by H. Sander", "PDF"),
    mis: src("record-mismatch-sample.xlsx", "Attached by H. Sander", "XLSX"),
    road: src("IT roadmap 2026–2027", "SharePoint · IT", "PPTX"),
    mes: src("MES upgrade project plan", "Planning · IT", "DATA"),
    iso: src("ISO audit calendar 2027", "SharePoint · Quality", "PDF"),
    ext6: src("Data migration in regulated labs", "Industry survey · 2024", "WEB"),
  },
  feed: { supporters: 35, sentiment: "Strong support from Quality and Engineering.", comments: [
    { name: "M. Roth", role: "Engineering lead", text: "This would save my team a day per audit.", daysAgo: 1 },
  ] },
};

export const BRIEFS: Readonly<Record<string, WrittenBrief>> = { i1: SPEND, i2: RIG, i6: RECORD };
