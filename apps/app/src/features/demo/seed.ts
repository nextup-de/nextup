// The demo company's seed - a 1:1 port of legacy/demo/js/data.js. Nothing here changes at
// runtime: what happens in the browser is an event (features/cases/events.ts) and the page renders
// reduce(seed, events). Rows may carry `seedEvents` - history that happened before day 0.
//
// Every count on the page is derived from these arrays; only figures with no underlying rows
// (medians, EUR values, survey coverage) live in METRICS. Demo data off -> "measured in pilot".
//
// criteria: the three case-level criteria (board §17 - score the case, never the person).
// Linking rules: idea.problem -> problem.id; problem.ideas -> [idea.id]; case.routeId -> route.id;
// signal.by / proposedBy / members[].name are the names the contributors list counts.
import type {
  Buddy, Dept, Idea, Initiative, Ledger, Metrics, Outcome, OrgPerson, Problem, RolePersona, Route, Seed, SeedCase, Stall, ViewCopy, WaitingOn,
} from "./types";

// The two promises the whole page is built around: days to a first answer,
// and days after launch until the outcome is measured. Change them here only.
export const PROMISE_DAYS = 5;
export const OUTCOME_DAYS = 14;

export const DEPTS: Dept[] = [
  { id: 'PRD', name: 'Production', people: 190 },
  { id: 'ENG', name: 'Engineering', people: 65 },
  { id: 'QUA', name: 'Quality', people: 30 },
  { id: 'FIN', name: 'Finance', people: 20 },
  { id: 'OPS', name: 'Ops & Admin', people: 45 },
  { id: 'HIT', name: 'HR / IT', people: 25 },
  { id: 'FLD', name: 'Field Service', people: 70 },
  { id: 'SAL', name: 'Sales', people: 55 }
];

export const PROBLEMS: Problem[] = [
  { id: 'p1', title: 'Three approval steps for spend under €5k', sub: 'A €400 sensor takes the same route as a €40k machine.',
    detail: 'Raised independently in Ops, Engineering and Field Service. Every purchase below €5k still passes cost-centre lead, department head and controlling — a median of nine days for items that are already budgeted.',
    people: 26, depts: ['OPS', 'ENG', 'FLD'], trend: 'Worsening', age: '14 months ago', months: 14, owner: 'ideas', timeLost: '210 h',
    spark: [0.4, 0.45, 0.5, 0.6, 0.7, 0.85, 1], ideas: ['i1'],
    signals: [
      { quote: 'I waited eleven days for a €380 replacement sensor. The line stood still for two of them.', by: 'Anonymous · Production, Line 3' },
      { quote: 'I have a budget. I am not allowed to spend my own budget without three signatures.', by: 'C. Ilg · Ops & Admin' },
      { quote: 'We order through a colleague in another department because his approval path is shorter.', by: 'Anonymous · Field Service' }
    ] },
  { id: 'p2', title: 'No slack: 97% of capacity is committed', sub: 'Nobody has hours left to try anything new.',
    detail: 'The strongest signal in the company and the one with no owner. Improvement work is scheduled on top of a full load, so it is the first thing dropped when a delivery date moves.',
    people: 64, depts: ['PRD', 'ENG', 'QUA', 'SAL', 'FLD', 'OPS', 'FIN'], trend: 'Flat', age: '11 months ago', months: 11, owner: 'none', timeLost: '—',
    spark: [0.8, 0.82, 0.8, 0.85, 0.83, 0.86, 0.85], ideas: ['i4'],
    signals: [
      { quote: 'I was asked to join an improvement team. Nothing was taken off my plate.', by: 'Anonymous · Engineering' },
      { quote: 'We plan at 97% and then wonder why nothing changes.', by: 'H. Sander · Quality' }
    ] },
  { id: 'p3', title: 'People who flag a risk get handed the fix', sub: 'So the second time, they stay quiet.',
    detail: 'Named nineteen times, 71% of it anonymously — which is itself the finding. Raising a concern is treated as volunteering, so early warnings arrive late or not at all.',
    people: 20, depts: ['PRD', 'QUA', 'HIT'], trend: 'Worsening', age: '9 months ago', months: 9, owner: 'none', timeLost: '—',
    spark: [0.35, 0.4, 0.5, 0.55, 0.7, 0.8, 0.95], ideas: ['i5'],
    signals: [
      { quote: 'I reported a tolerance drift and became the project lead for fixing it. On top of my job.', by: 'Anonymous · Quality' },
      { quote: 'Nobody is punished for problems here. You are just made responsible for them.', by: 'Anonymous · Production' }
    ] },
  { id: 'p4', title: 'Quality data lives in three systems', sub: 'Nobody trusts a number they did not pull themselves.',
    detail: 'Measurement data sits in the MES, a shared drive and two Access databases. Reconciling a single week costs a full day and the versions still disagree.',
    people: 17, depts: ['QUA', 'PRD', 'HIT'], trend: 'Flat', age: '2 years ago', months: 24, owner: 'ideas', timeLost: '96 h',
    spark: [0.6, 0.62, 0.6, 0.63, 0.6, 0.62, 0.61], ideas: ['i6'],
    signals: [
      { quote: 'Three systems, three truths. We spend the morning agreeing which one is real.', by: 'H. Sander · Quality' }
    ] },
  { id: 'p5', title: 'Sales hears about product changes from customers', sub: 'Engineering ships, nobody tells the field.',
    detail: 'Three customer escalations last quarter traced to changes Sales did not know had shipped. A weekly change note now runs as a trial between the two departments.',
    people: 12, depts: ['SAL', 'ENG'], trend: 'Improving', age: '7 months ago', months: 7, owner: 'trial', timeLost: '40 h',
    spark: [0.9, 0.85, 0.8, 0.6, 0.45, 0.35, 0.25], ideas: ['i7'],
    signals: [
      { quote: 'A customer told me about our new firmware. I had to pretend I knew.', by: 'N. Kaya · Sales' }
    ] },
  { id: 'p6', title: 'Test rig booked out six weeks ahead', sub: 'Four ideas are waiting on one machine.',
    detail: 'The only endurance rig is fully booked by series validation. Anything exploratory queues behind it, which quietly kills small experiments before they start.',
    people: 10, depts: ['ENG', 'QUA'], trend: 'Flat', age: '5 months ago', months: 5, owner: 'ideas', timeLost: '—',
    spark: [0.5, 0.55, 0.5, 0.6, 0.55, 0.6, 0.58], ideas: ['i2'],
    signals: [
      { quote: 'Six weeks to test a two-day change. We stopped asking.', by: 'M. Roth · Engineering' }
    ] },
  { id: 'p7', title: 'New hires wait five weeks for system access', sub: 'Paid, onboarded, and unable to work.',
    detail: 'Access requests are raised per system, sequentially, after the start date. A bundled request template cut this to eleven days at the Ulm site.',
    people: 7, depts: ['HIT', 'OPS'], trend: 'Improving', age: '3 months ago', months: 3, owner: 'trial', timeLost: '64 h',
    spark: [0.9, 0.88, 0.7, 0.55, 0.4, 0.3, 0.28], ideas: ['i8'],
    signals: [
      { quote: 'My first two weeks were reading PDFs because I had no login.', by: 'L. Brandt · HR / IT' }
    ] }
];

export const IDEAS: Idea[] = [
  { id: 'i1', title: 'Team-level spend authority up to €5k', criteria: { fit: true, urgent: true, kpi: 'purchase lead time' }, problem: 'p1', status: 'Awaiting decision', wait: 19,
    expected: '−9 days per purchase', upside: '€240k', effort: '2 people · 6 wks', proposedBy: 'C. Ilg, Ops',
    blocker: 'Needs a CFO signature to leave the two pilot sites.',
    rationale: 'Give cost-centre teams a standing €5k authority with monthly review instead of pre-approval. Already run at two sites for a quarter: no budget overrun, purchase lead time down from twelve days to two.',
    team: ['C. Ilg', 'R. Nowak', 'Anonymous'], teamNote: 'Needs a CFO signature to move beyond the two pilot sites — that signature is what the 19 days are.',
    seedEvents: [{ type: 'idea.cosigned', day: -19, actor: 'Anonymous #4471' }] },
  { id: 'i2', title: 'Hold 20% of test-rig time for experiments', criteria: { fit: true, urgent: false, kpi: 'rig utilisation' }, problem: 'p6', status: 'Awaiting decision', wait: 4,
    expected: 'unblocks 4 queued ideas', upside: '€90k', effort: '1 person · 2 wks', proposedBy: 'M. Roth, Engineering',
    blocker: 'Engineering and Quality must agree the reserved slot.',
    rationale: 'Reserve one day a week on the endurance rig for unscheduled trials, bookable the same week. Series validation loses 20% of a machine; four stalled ideas get a way to be tested cheaply.',
    team: ['M. Roth', 'H. Sander'], teamNote: 'Engineering and Quality both need to agree the reserved slot. No budget required.' },
  { id: 'i3', title: 'Retrofit kit line for installed machines', criteria: { fit: true, urgent: false, kpi: 'service revenue' }, problem: 'p5', status: 'In trial', wait: 0,
    expected: '€410k booked so far', upside: '€410k', effort: '5 people · running', proposedBy: '11 people, Sales',
    rationale: 'Customers repeatedly asked to buy upgrade kits for machines already in the field. Sales, Engineering and Production built two kits for the most-requested models; phase two extends to export markets.',
    team: ['A. Weber', 'M. Roth', 'J. Klein'], teamNote: 'Day 9 of phase two. First phase shipped in May and is already booked.' },
  { id: 'i4', title: 'Protect one day a fortnight for improvement work', criteria: { fit: true, urgent: false, kpi: null }, problem: 'p2', status: 'Unfunded', wait: 0,
    expected: 'capacity for trials', upside: 'not modelled', effort: '≈2% of payroll hours', proposedBy: '14 people, company-wide',
    rationale: 'Plan improvement time into the schedule instead of on top of it. The most-supported idea in the company and the one nobody can approve below board level, because it changes what the plan assumes.',
    team: ['—'], teamNote: 'No owner. This is a capacity decision, not a project.' },
  { id: 'i5', title: 'Blameless review, separate from ownership', criteria: { fit: false, urgent: true, kpi: null }, problem: 'p3', status: 'Unfunded', wait: 0,
    expected: 'earlier warnings', upside: 'not modelled', effort: '1 person · 4 wks', proposedBy: 'Anonymous, Quality',
    rationale: 'Split reporting a problem from being assigned it: whoever raises an issue is explicitly not its owner. Cheap to try, and it addresses the signal that 71% of people would only give anonymously.',
    team: ['—'], teamNote: 'Proposed by Quality and HR / IT jointly. Nobody assigned.' },
  { id: 'i6', title: 'One measurement record, one place', criteria: { fit: true, urgent: false, kpi: 'scrap rate' }, problem: 'p4', status: 'Awaiting decision', wait: 3,
    expected: '−96 h / month reconciling', upside: '€120k', effort: '3 people · 10 wks', proposedBy: 'H. Sander, Quality',
    blocker: 'IT capacity is the constraint, not the approach.',
    rationale: 'Retire the two Access databases and write measurements once, into the MES. Unglamorous, well understood, and blocks four other ideas that need trustworthy quality data.',
    team: ['H. Sander', 'L. Brandt', 'T. Vogel'], teamNote: 'IT capacity is the constraint, not the approach.' },
  { id: 'i7', title: 'Weekly change note from Engineering to the field', criteria: { fit: false, urgent: true, kpi: 'customer escalations' }, problem: 'p5', status: 'In trial', wait: 0,
    expected: 'escalations 3 → 0', upside: '€40k', effort: '2 h / week', proposedBy: 'N. Kaya, Sales',
    rationale: 'One page every Friday: what shipped, what changed, what customers will notice. Running for seven weeks; no customer-side surprises since week two.',
    team: ['N. Kaya', 'M. Roth'], teamNote: 'Costs nothing but attention. Decide whether it becomes standard.' },
  { id: 'i8', title: 'Bundle new-hire access into one request', criteria: { fit: false, urgent: false, kpi: 'time to first productive day' }, problem: 'p7', status: 'Shipped', wait: 0,
    expected: '5 weeks → 11 days', upside: '€64k', effort: 'shipped in 3 wks', proposedBy: 'L. Brandt, HR / IT',
    rationale: 'One template raised at contract signature instead of eight sequential tickets after the start date. Live at Ulm, rolling out to the second site this quarter.',
    team: ['L. Brandt', 'B. Ehlers'], teamNote: 'Shipped. Being copied by the other sites without further approval.' }
];

export const INITIATIVES: Initiative[] = [
  { id: 't1', idea: 'i3', name: 'Retrofit kit line', depts: ['SAL', 'ENG', 'PRD'], people: 5, status: 'In trial', stage: 'day 9 of phase two',
    why: 'customers kept asking to buy upgrade kits we did not sell',
    members: [{ name: 'A. Weber', role: 'Sales' }, { name: 'M. Roth', role: 'Engineering' }, { name: 'J. Klein', role: 'Production' }, { name: 'S. Dahl', role: 'Production' }, { name: 'P. Mayer', role: 'Sales' }] },
  { id: 't2', name: 'Offline job sheets for field service', depts: ['FLD', 'HIT'], people: 2, status: 'Building', stage: 'day 18',
    why: 'technicians enter the same job data twice, once on paper and once at the hotel',
    members: [{ name: 'D. Ferraro', role: 'Field Service' }, { name: 'L. Brandt', role: 'HR / IT' }] },
  { id: 't3', idea: 'i1', name: 'Team spend authority', depts: ['OPS', 'FIN', 'PRD'], people: 3, status: 'Awaiting decision', stage: 'waiting 19 days',
    why: 'three approvals were needed for any spend under €5k',
    members: [{ name: 'C. Ilg', role: 'Ops & Admin' }, { name: 'R. Nowak', role: 'Finance' }, { name: 'Anonymous', role: 'Production' }],
    stuckOn: { name: 'K. Adler', reason: 'CFO signature to leave the two pilot sites' } },
  { id: 't4', name: '4-series fixture redesign', depts: ['PRD', 'QUA', 'ENG'], people: 4, status: 'Shipped', stage: 'shipped day 54',
    why: 'rework on the 4-series housing was accepted as normal',
    members: [{ name: 'T. Vogel', role: 'Production' }, { name: 'H. Sander', role: 'Quality' }, { name: 'M. Roth', role: 'Engineering' }, { name: 'Anonymous', role: 'Production' }] },
  { id: 't5', name: 'Self-serve spare parts quoting', depts: ['SAL', 'HIT'], people: 3, status: 'Shipped', stage: 'shipped day 41',
    why: 'every spare part was quoted by hand, often twice',
    members: [{ name: 'N. Kaya', role: 'Sales' }, { name: 'B. Ehlers', role: 'HR / IT' }, { name: 'Anonymous', role: 'Sales' }] },
  { id: 't6', idea: 'i2', name: 'Shared test-rig booking', depts: ['ENG', 'QUA'], people: 0, status: 'Proposed', stage: 'nobody assigned',
    why: 'the only endurance rig is booked six weeks out',
    members: [{ name: 'M. Roth', role: 'proposed lead' }] },
  { id: 't7', idea: 'i5', name: 'Blameless incident reviews', depts: ['QUA', 'HIT'], people: 0, status: 'Proposed', stage: 'nobody assigned',
    why: 'people who flag a risk get handed the fix, so they stop flagging',
    members: [{ name: 'Anonymous', role: 'proposed by Quality' }] },
  { id: 't8', idea: 'i6', name: 'One measurement record', depts: ['QUA', 'PRD', 'HIT'], people: 3, status: 'Awaiting decision', stage: 'waiting 3 days',
    why: 'quality data lives in three systems that disagree',
    members: [{ name: 'H. Sander', role: 'Quality' }, { name: 'L. Brandt', role: 'HR / IT' }, { name: 'T. Vogel', role: 'Production' }],
    stuckOn: { name: 'L. Brandt', reason: 'IT capacity for the integration' } }
];

// The org chart (collaboration page). Every name that appears in ROUTES, ROLES or an
// initiative's members has a row here; `reportsTo` draws the tree. Anonymous members do not.
export const PEOPLE: OrgPerson[] = [
  { name: 'E. Lindqvist', role: 'Managing director', dept: 'OPS', reportsTo: null },
  { name: 'B. Hartmann', role: 'Head of Production', dept: 'PRD', reportsTo: 'E. Lindqvist' },
  { name: 'K. Adler', role: 'CFO', dept: 'FIN', reportsTo: 'E. Lindqvist' },
  { name: 'M. Roth', role: 'Engineering lead', dept: 'ENG', reportsTo: 'E. Lindqvist' },
  { name: 'H. Sander', role: 'Quality lead', dept: 'QUA', reportsTo: 'E. Lindqvist' },
  { name: 'C. Ilg', role: 'Ops & Admin lead', dept: 'OPS', reportsTo: 'E. Lindqvist' },
  { name: 'L. Brandt', role: 'IT service lead', dept: 'HIT', reportsTo: 'E. Lindqvist' },
  { name: 'N. Kaya', role: 'Sales lead', dept: 'SAL', reportsTo: 'E. Lindqvist' },
  { name: 'D. Ferraro', role: 'Field Service lead', dept: 'FLD', reportsTo: 'E. Lindqvist' },
  { name: 'T. Vogel', role: 'Team lead, 4-series', dept: 'PRD', reportsTo: 'B. Hartmann' },
  { name: 'J. Klein', role: 'Line 2', dept: 'PRD', reportsTo: 'T. Vogel' },
  { name: 'S. Dahl', role: 'Line 3', dept: 'PRD', reportsTo: 'T. Vogel' },
  { name: 'J. Schmidt', role: 'Line 3', dept: 'PRD', reportsTo: 'T. Vogel' },
  { name: 'R. Nowak', role: 'Cost-centre lead', dept: 'FIN', reportsTo: 'K. Adler' },
  { name: 'A. Weber', role: 'Key accounts', dept: 'SAL', reportsTo: 'N. Kaya' },
  { name: 'P. Mayer', role: 'Inside sales', dept: 'SAL', reportsTo: 'N. Kaya' },
  { name: 'B. Ehlers', role: 'HR services', dept: 'HIT', reportsTo: 'L. Brandt' }
];

export const OUTCOMES: Outcome[] = [
  { title: 'Bundle new-hire access into one request', promised: '5 wks → 11 d', actual: '5 wks → 11 d', verdict: 'As promised' },
  { title: 'Self-serve spare parts quoting', promised: '€180k / yr', actual: '€231k / yr', verdict: 'Beat it' },
  { title: '4-series fixture redesign', promised: '−40 h / wk rework', actual: '−26 h / wk rework', verdict: 'Short' },
  { title: 'Retrofit kit line, phase one', promised: '€300k booked', actual: '€410k booked', verdict: 'Beat it' }
];

// ── Roles ────────────────────────────────────────────────────────────────
// Three roles, three home screens (PRODUCT_CONCEPT_ORG_OS.md §8):
//   employee  → "what happened to what I sent" + one field to raise something
//   lead      → "one list: open items addressed to me, sorted by age, one action each"
//   manager   → the ledger: what is waiting, how the system moves, what it costs
export const ROLES: RolePersona[] = [
  { id: 'member', label: 'Employee', dept: 'PRD',
    who: { name: 'J. Schmidt', ini: 'JS', line: 'Production, Line 3', handle: 'Anonymous #4471' } },
  { id: 'leader', label: 'Team leader', dept: 'PRD',
    who: { name: 'T. Vogel', ini: 'TV', line: 'Team lead · Production, 4-series', handle: null } },
  { id: 'manager', label: 'Manager', dept: 'PRD',
    who: { name: 'B. Hartmann', ini: 'BH', line: 'Head of Production · 190 people', handle: null } }
];

// The three team leads. Every routing row is owned by one of them with another as deputy,
// so a case can be followed from desk to desk (dev panel → "inbox of") and never leaves view.
export const LEADERS: string[] = ['T. Vogel', 'M. Roth', 'H. Sander'];

// The routing table (PRODUCT_CONCEPT_ORG_OS.md §19): recurring request type →
// owning role · deputy · buddy in the neighbouring department. Filled in once
// by a department head. The intake box matches typed text against `keys` and
// *proposes* the row — it never decides (§11.2). Owner and deputy are always
// two of LEADERS; the buddy is the sideways contact and may be anyone.
export const ROUTES: Route[] = [
  { id: 'r1', type: 'Spend under €5k (parts, tools, consumables)', keys: ['spend', 'buy', 'order', 'purchase', 'sensor', 'part', 'budget', '€', 'invoice', 'supplier'],
    owner: { name: 'T. Vogel', role: 'Team lead, 4-series', dept: 'PRD' }, deputy: 'M. Roth', buddy: 'C. Ilg · Ops & Admin', wait: '3 d' },
  { id: 'r2', type: 'Test-rig or machine time', keys: ['rig', 'test', 'machine', 'booking', 'slot', 'validation', 'endurance'],
    owner: { name: 'M. Roth', role: 'Engineering lead', dept: 'ENG' }, deputy: 'H. Sander', buddy: 'M. Roth · Engineering', wait: '4 d' },
  { id: 'r3', type: 'Quality data, measurements, tolerances', keys: ['quality', 'tolerance', 'measurement', 'mes', 'rework', 'scrap', 'drift', 'defect'],
    owner: { name: 'H. Sander', role: 'Quality lead', dept: 'QUA' }, deputy: 'T. Vogel', buddy: 'H. Sander · Quality', wait: '2 d' },
  { id: 'r4', type: 'System access, logins, IT equipment', keys: ['access', 'login', 'laptop', 'account', 'password', 'it ', 'software', 'system', 'vpn'],
    owner: { name: 'M. Roth', role: 'Engineering lead', dept: 'ENG' }, deputy: 'H. Sander', buddy: 'L. Brandt · HR / IT', wait: '4 d' },
  { id: 'r5', type: 'Product change reaching the field', keys: ['customer', 'firmware', 'change note', 'release', 'field', 'shipped', 'sales'],
    owner: { name: 'H. Sander', role: 'Quality lead', dept: 'QUA' }, deputy: 'M. Roth', buddy: 'N. Kaya · Sales', wait: '2 d' },
  { id: 'r6', type: 'Shift plan, staffing, overtime', keys: ['shift', 'overtime', 'staff', 'holiday', 'roster', 'capacity', 'hours', 'people'],
    owner: { name: 'T. Vogel', role: 'Team lead, 4-series', dept: 'PRD' }, deputy: 'H. Sander', buddy: 'D. Ferraro · Field Service', wait: '1 d' },
  { id: 'r7', type: 'Fixture, tooling or line layout', keys: ['fixture', 'tooling', 'layout', 'line', 'housing', 'jig', 'setup', 'changeover'],
    owner: { name: 'T. Vogel', role: 'Team lead, 4-series', dept: 'PRD' }, deputy: 'M. Roth', buddy: 'M. Roth · Engineering', wait: '2 d' },
  { id: 'r8', type: 'Paperwork done twice (forms, job sheets)', keys: ['paper', 'form', 'twice', 'double', 'sheet', 'excel', 'report', 'manual'],
    owner: { name: 'H. Sander', role: 'Quality lead', dept: 'QUA' }, deputy: 'T. Vogel', buddy: 'D. Ferraro · Field Service', wait: '3 d' }
];

// Cases. One entity, three views: the employee sees the ones they raised
// (`from`), a team leader sees the ones addressed to them right now
// (`assignee`, open), the manager sees all. `raisedDay` is relative to demo
// day 0 (today); age is derived. `reason` is the stall reason the system
// *proposes* for why it is still open (the four from board 2: triage · no
// time · wrong department · not responsible). `seedEvents` is history that
// already happened — see js/store.js for the event types.
export const CASES: SeedCase[] = [
  // ── open, addressed to T. Vogel (the team leader persona) ──
  { id: 'c1', title: 'Rework on the 4-series housing is back — new batch of castings', from: 'Anonymous #2210', fromDept: 'Production, Line 2',
    routeId: 'r7', assignee: 'T. Vogel', raisedDay: -7, reason: 'no time', upside: '≈ 30 h / month rework',
    body: 'The castings from the new supplier need the same hand-finish we removed with the fixture redesign. Three people are doing it off-plan.' },
  { id: 'c2', title: 'Night shift has no one who can sign a €300 parts order', from: 'S. Dahl', fromDept: 'Production, 4-series',
    routeId: 'r1', assignee: 'T. Vogel', raisedDay: -4, reason: 'not responsible', upside: 'line stops avoided',
    body: 'When a belt goes at 02:00 we wait for the day shift to approve a €300 replacement. Twice last month the line stood until 07:30.' },
  { id: 'c3', title: 'Changeover sheet and MES ask for the same six numbers', from: 'Anonymous #4471', fromDept: 'Production, Line 3',
    routeId: 'r8', assignee: 'T. Vogel', raisedDay: -3, reason: 'is it important', upside: '≈ 20 min per changeover',
    body: 'Every changeover we write the same six values on paper and then type them into the MES. Twelve changeovers a shift.' },
  { id: 'c4', title: 'Tolerance drift on station 7 — who owns the gauge calibration?', from: 'J. Klein', fromDept: 'Production, 4-series',
    routeId: 'r3', assignee: 'T. Vogel', raisedDay: -1, reason: 'wrong department', upside: 'scrap on station 7',
    body: 'The gauge reads 0.02 off against Quality\u2019s reference. Quality says it is ours; we say it is theirs. Meanwhile parts get scrapped.' },
  { id: 'c5', title: 'Two apprentices still have no MES login after four weeks', from: 'P. Mayer', fromDept: 'Production, Line 1',
    routeId: 'r4', assignee: 'T. Vogel', raisedDay: -1, reason: 'wrong department', upside: '2 people idle on paperwork',
    body: 'Started 18 August. Tickets raised per system. They shadow others because they cannot book their own work.' },
  { id: 'c6', kind: 'idea', title: 'Can Line 3 borrow the endurance rig on Fridays?', from: 'Anonymous #0931', fromDept: 'Production, Line 3',
    routeId: 'r2', assignee: 'T. Vogel', raisedDay: -1, reason: 'is it important', upside: 'unblocks the belt-tension trial',
    body: 'We have a two-day trial ready since June. The rig is booked six weeks out by series validation.' },

  // ── the employee persona's history (Anonymous #4471) — answered, built, shipped ──
  { id: 'c7', kind: 'idea', title: 'Bundle new-hire access into one request', from: 'Anonymous #4471', fromDept: 'Production, Line 3',
    routeId: 'r4', assignee: 'L. Brandt', raisedDay: -184, reason: 'wrong department', upside: '5 weeks of paid waiting per hire', linkedIdea: 'i8',
    body: 'Eight sequential tickets after the start date. My first two weeks were reading PDFs because I had no login.',
    seedEvents: [
      { type: 'case.read', day: -183, actor: 'L. Brandt' },
      { type: 'case.decided', day: -181, actor: 'L. Brandt', payload: { answer: 'yes', note: 'We are doing this. One template at contract signature, HR raises it, IT pre-provisions. You are credited on the rollout note.' } },
      { type: 'case.building', day: -178, actor: 'L. Brandt', payload: { days: 21, expected: '5 weeks → 11 days' } },
      { type: 'case.shipped', day: -74, actor: 'L. Brandt', payload: { outcome: '5 weeks → 11 days', outcomeNote: 'measured across 9 new hires' } }
    ] },
  { id: 'c8', kind: 'idea', title: 'Stop double-entering job data on paper', from: 'Anonymous #4471', fromDept: 'Production, Line 3',
    routeId: 'r8', assignee: 'D. Ferraro', raisedDay: -104, reason: 'no time', upside: '≈ 3 h / week / technician',
    body: 'Technicians enter the same job data twice, once on paper and once at the hotel.',
    seedEvents: [
      { type: 'case.read', day: -103, actor: 'D. Ferraro' },
      { type: 'case.decided', day: -102, actor: 'D. Ferraro', payload: { answer: 'yes', note: 'Agreed and funded. Two people on it: offline job sheets that sync when you get signal. Want to test the first build with us?' } },
      { type: 'case.building', day: -18, actor: 'D. Ferraro', payload: { days: 30, expected: '−3 h / week / technician' } }
    ] }
];

// What the team leader's own team is waiting on elsewhere — the other end of
// the same asymmetry (§12): the cost is felt here, the authority sits there.
export const WAITING_ON: WaitingOn[] = [
  { title: 'Team-level spend authority up to €5k', owner: 'CFO office', dept: 'Finance', age: 19, promised: PROMISE_DAYS },
  { title: 'Reserved rig day for unscheduled trials', owner: 'M. Roth', dept: 'Engineering', age: 4, promised: PROMISE_DAYS },
  { title: 'Gauge calibration ownership, station 7', owner: 'H. Sander', dept: 'Quality', age: 2, promised: PROMISE_DAYS },
  { title: 'MES logins for two apprentices', owner: 'L. Brandt', dept: 'HR / IT', age: 1, promised: PROMISE_DAYS }
];

// Static buddy pairs for the Production team (§16): one lateral edge per
// neighbouring department, set by two department heads, overridable per case.
export const BUDDIES: Buddy[] = [
  { name: 'M. Roth', ini: 'MR', dept: 'Engineering', note: 'rig time, fixtures, drawings' },
  { name: 'H. Sander', ini: 'HS', dept: 'Quality', note: 'gauges, tolerances, measurement data' },
  { name: 'L. Brandt', ini: 'LB', dept: 'HR / IT', note: 'logins, devices, onboarding' },
  { name: 'C. Ilg', ini: 'CI', dept: 'Ops & Admin', note: 'orders, forms, the approval route' }
];

// Where the waiting goes — every wait segment in the ledger carries one of
// the four stall reasons (board 2). Days are the sum over all cases since launch.
export const STALL: Stall[] = [
  { reason: 'Wrong department', days: 23, share: 0.38, note: 'the map was wrong — it went one level up instead of sideways' },
  { reason: 'Not responsible', days: 17, share: 0.28, note: 'the map had no entry — nobody owns it' },
  { reason: 'No time → returned', days: 12, share: 0.21, note: 'bounced back to the sender unread' },
  { reason: 'Is it important', days: 8, share: 0.13, note: 'the receiver could not rank it against their own work' }
];

// The two December numbers (CONCEPT_CHECK_SEP13.md §4.1, step 5).
export const LEDGER: Ledger = {
  firstAnswer: '26 h', firstAnswerWas: 'was 9 d', withinPromise: '84%', withinPromiseWas: 'was 31%',
  escalated: 9, handedOver: 7, overrides: '6 of 54', overridesNote: 'proposed owners were overruled — the map is right 9 times in 10'
};

// ── Aggregates with no underlying rows ──────────────────────────────────
// Everything here is a measured (or, in the demo, invented) figure. When
// demo data is off the page shows "measured in pilot" instead of these.
export const METRICS: Metrics = {
  // Discovery interviews (the total is the sum of DEPTS.people).
  discovery: { round: 2, interviewed: 320, note: 'Production and Field Service still under half' },
  // Raw signals before clustering — more than the quotes kept per problem.
  signals: 131,
  // Manager overview KPIs and movement since the baseline survey.
  ideaToDecision: { now: '4d', was: 'was 12d', spark: [0.95, 1, 0.9, 0.6, 0.45, 0.35, 0.3] },
  valueBooked: { now: '€705k', delta: '+€435k', was: 'was €270k', sub: '€295k of it recurring', spark: [0.18, 0.2, 0.19, 0.45, 0.62, 0.82, 1] },
  waitingDaysSaved: { now: '120 d', spark: [0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1] },
  shippedWas: 'was 1', shippedSpark: [0.25, 0.3, 0.22, 0.5, 0.7, 0.85, 1],
  noOwnerWas: 'was 4', noOwnerSpark: [0.4, 0.42, 0.5, 0.55, 0.62, 0.7, 0.8],
  contributing: { now: '131', was: 'was 44', spark: [0.2, 0.22, 0.21, 0.4, 0.52, 0.6, 0.64] },
  stoppedEarly: 3,
  nextCall: 'Thursday 14:00 · 25 min',
  // Progress → "Did anyone answer them".
  answered: { replied: '119 of 131', median: '3d', credited: 64 },
  // Employee → "Your contribution".
  you: { medianWait: '2 d' },
  // Team leader → inbox stats.
  lead: { medianAnswer: '2 d', withinPromise: '9 / 11' }
};

export const VIEWS: Record<string, ViewCopy> = {
  mine: { title: 'What happened to what you sent', sub: 'Every problem or idea you raised, who is answering it, when they owe you that answer, and what it changed once it shipped.' },
  inbox: { title: 'Inbox', sub: '' },
  overview: { title: 'Overview', sub: '' },
  problems: { title: 'Problems named by employees', sub: 'Root problems clustered from {signals} signals. People choose whether to sign their name.' },
  ideas: { title: 'Ideas from the organisation', sub: 'Each idea is tagged on three case criteria — strategic fit, urgency and the manager KPI it moves. No score, no ranking of people.' },
  network: { title: 'Collaboration across departments', sub: 'Every project, the people on it, and where in the company it is waiting. Click a project or a person.' },
  progress: { title: 'Does the system actually move', sub: 'Twelve months of flow, where ideas stall, and whether people got an answer.' }
};

export const SEED: Seed = {
  promiseDays: PROMISE_DAYS, outcomeDays: OUTCOME_DAYS,
  depts: DEPTS, people: PEOPLE, problems: PROBLEMS, ideas: IDEAS, initiatives: INITIATIVES, outcomes: OUTCOMES,
  personas: ROLES, leaders: LEADERS, routes: ROUTES, cases: CASES, waitingOn: WAITING_ON, buddies: BUDDIES,
  stall: STALL, ledger: LEDGER, metrics: METRICS, views: VIEWS
};
