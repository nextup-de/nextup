// The sample data behind the dev panel's Demo data switch: a car maker's plant, built around whoever is
// looking. It stays in this browser tab and never reaches the database, so it needs no company content:
// an empty demo company fills up the moment the switch is on.
//
// Pure. Every person in it is made up and no manufacturer is named: the Nextup repo is public, so these
// must never read as another company's real internal problems. Days are relative to `today`.
import type { Role } from "@/config/roles";
import type { SeatRow } from "@/features/auth/identity";
import type { SeedEvent } from "@/features/cases/events";
import type { ZiRow } from "@/features/metrics/types";
import type { SeedProject } from "@/features/projects/types";
import type { Buddy, Dept, Idea, Initiative, Ledger, Metrics, OrgPerson, Outcome, Problem, Route, Seed, SeedCase, SeedGoal, SeedRole, SpendRule, Stall, WaitingOn } from "./types";

export const SAMPLE_PREFIX = "sample-";

/** Is this event's target part of the sample data? Those events stay in this browser. */
export const isSampleId = (id: string | null | undefined): boolean => Boolean(id?.startsWith(SAMPLE_PREFIX));

export type SampleViewer = { userId: string | null; name: string; handle: string | null; role: Role };

/**
 * Only after someone switched it on, on a stage with demo tools. Where demo data is the default (the static
 * demo, the demo test suite) the company's own scripted seed stays, and a real company never gets this.
 */
export function sampleDataOn(tenant: { demoTools?: boolean; demoDataDefault?: boolean }, switched: boolean | undefined): boolean {
  return switched === true && tenant.demoTools !== false && tenant.demoDataDefault !== true;
}

const DEPTS: Dept[] = [
  { id: "PRD", name: "Body & Assembly", people: 4200 },
  { id: "ENG", name: "Vehicle Engineering", people: 1800 },
  { id: "QUA", name: "Quality", people: 600 },
  { id: "LOG", name: "Logistics", people: 900 },
  { id: "PUR", name: "Purchasing", people: 220 },
  { id: "HIT", name: "IT & Digital", people: 310 },
];

const ROLES: SeedRole[] = [
  { id: "sample-role-plant", orgUnitId: "PRD", reportsToId: null, title: "Head of Body & Assembly" },
  { id: "sample-role-desk", orgUnitId: "PRD", reportsToId: "sample-role-plant", title: "Team lead, final assembly" },
  { id: "sample-role-eng", orgUnitId: "ENG", reportsToId: null, title: "Head of Vehicle Test" },
  { id: "sample-role-qua", orgUnitId: "QUA", reportsToId: null, title: "Head of Plant Quality" },
  { id: "sample-role-log", orgUnitId: "LOG", reportsToId: null, title: "Head of Inbound Logistics" },
  { id: "sample-role-pur", orgUnitId: "PUR", reportsToId: null, title: "Lead Buyer, Interior" },
];

const BOSS = "S. Krüger";
const PEOPLE: OrgPerson[] = [
  { name: BOSS, role: "Head of Body & Assembly", dept: "PRD", reportsTo: null },
  { name: "M. Hoffmann", role: "Team lead, final assembly", dept: "PRD", reportsTo: BOSS },
  { name: "L. Becker", role: "Battery pack line", dept: "PRD", reportsTo: "M. Hoffmann" },
  { name: "A. Schulz", role: "Paint shop, shift B", dept: "PRD", reportsTo: BOSS },
  { name: "E. Wagner", role: "Head of Vehicle Test", dept: "ENG", reportsTo: null },
  { name: "K. Yilmaz", role: "Head of Plant Quality", dept: "QUA", reportsTo: null },
  { name: "T. Richter", role: "Quality engineer", dept: "QUA", reportsTo: "K. Yilmaz" },
  { name: "N. Demir", role: "Head of Inbound Logistics", dept: "LOG", reportsTo: null },
  { name: "J. Fischer", role: "Packaging planner", dept: "LOG", reportsTo: "N. Demir" },
  { name: "P. Neumann", role: "Lead Buyer, Interior", dept: "PUR", reportsTo: null },
  { name: "C. Vogt", role: "Shop-floor IT", dept: "HIT", reportsTo: null },
];

const BUDDIES: Buddy[] = [
  { name: "K. Yilmaz", ini: "KY", dept: "Quality", note: "gauges, torque records, end-of-line findings" },
  { name: "N. Demir", ini: "ND", dept: "Logistics", note: "sequencing, racks, supplier deliveries" },
  { name: "C. Vogt", ini: "CV", dept: "IT & Digital", note: "MES, scanners, shop-floor tablets" },
];

const route = (id: string, type: string, keys: string[], seat: string, name: string, role: string, dept: string, deputy: string, buddy: string): Route => ({
  id: "sample-r" + id, type, keys, owner: { name, role, dept }, deputy, buddy, wait: "2 d",
  ownerRoleId: "sample-role-" + seat, ownerSeatId: "sample-seat-" + seat, deputyRoleId: null, deputySeatId: null,
});

const GOALS: SeedGoal[] = [
  { goal: "No line stop from late or mis-sequenced parts", keys: ["sequence", "harness", "supplier", "line stop", "delivery"] },
  { goal: "First-pass yield at end of line above 92 %", keys: ["seal", "torque", "rework", "leak", "defect", "weld"] },
  { goal: "Energy per vehicle down 15 %", keys: ["energy", "kwh", "standby", "robot", "oven"] },
];
const SPEND: SpendRule = { limitEur: 5000, text: "team-level authority up to €5k, no controlling sign-off" };

const PROBLEMS: Problem[] = [
  { id: "sample-p1", title: "Late or out-of-sequence parts stop the line", sub: "Suppliers learn about a stop after it has happened.",
    detail: "Modules arrive just in sequence, so one wrong rack stops final assembly within minutes. Suppliers hear about it by phone, after the stop.",
    people: 34, depts: ["PRD", "LOG", "PUR"], trend: "Worsening", age: "8 months ago", months: 8, owner: "ideas", timeLost: "310 h",
    spark: [0.4, 0.45, 0.55, 0.6, 0.72, 0.85, 1], ideas: ["sample-i1"],
    signals: [
      { quote: "We find out the harness is wrong when the car is already on the station.", by: "Anonymous · Final assembly" },
      { quote: "The supplier could have re-sequenced an hour earlier, if anyone had told them.", by: "N. Demir · Logistics" },
    ] },
  { id: "sample-p2", title: "Quality findings arrive days after the fault was made", sub: "By then, two hundred more bodies have the same fault.",
    detail: "End-of-line findings go back to the body shop as a weekly report, while the weld data that could flag them sits unused in the line's controller.",
    people: 21, depts: ["QUA", "PRD", "HIT"], trend: "Flat", age: "1 year ago", months: 12, owner: "ideas", timeLost: "140 h",
    spark: [0.6, 0.62, 0.6, 0.64, 0.62, 0.63, 0.62], ideas: ["sample-i2"],
    signals: [{ quote: "The controller knows the spot weld was weak. Nobody asks it.", by: "T. Richter · Quality" }] },
  { id: "sample-p3", title: "The battery leak test fails good packs", sub: "Every false fail costs a teardown and a retest.",
    detail: "Temperature swings in the hall pushed readings over the limit. A clear retest rule has cut the teardowns, and the pack line now uses it on every shift.",
    people: 12, depts: ["PRD", "QUA"], trend: "Improving", age: "7 months ago", months: 7, owner: "trial", timeLost: "85 h",
    spark: [0.9, 0.85, 0.7, 0.5, 0.4, 0.3, 0.25], ideas: ["sample-i3"],
    signals: [{ quote: "We opened a good pack twice last week, just to close it again.", by: "L. Becker · Battery pack line" }] },
  { id: "sample-p4", title: "Shift handover lives on paper", sub: "The next shift repeats what the last one already found.",
    detail: "Open faults are written on a sheet at each station. The incoming shift reads what it can, and a known fault gets found a second time.",
    people: 18, depts: ["PRD", "HIT"], trend: "Improving", age: "5 months ago", months: 5, owner: "trial", timeLost: "60 h",
    spark: [0.8, 0.8, 0.7, 0.6, 0.5, 0.42, 0.38], ideas: ["sample-i4"],
    signals: [{ quote: "Twenty minutes into the shift we learn what the last shift already knew.", by: "Anonymous · Final assembly" }] },
];

const OUTCOMES: Outcome[] = [
  { title: "One retest rule for the battery leak test", promised: "−60 % teardowns", actual: "−71 % teardowns", verdict: "Beat it" },
  { title: "Digital shift handover, final assembly", promised: "12 min → 4 min", actual: "12 min → 5 min", verdict: "Short" },
  { title: "Standby for welding robots, trial cell", promised: "−8 % energy in the cell", actual: "−8 % energy in the cell", verdict: "As promised" },
];

const WAITING_ON: WaitingOn[] = [
  { title: "Line-stop alerts for Tier-1 suppliers", owner: "P. Neumann", dept: "Purchasing", age: 7, promised: 5 },
  { title: "Flashing slots for test vehicles", owner: "E. Wagner", dept: "Vehicle Engineering", age: 4, promised: 5 },
  { title: "Scanner profile for the torque tools", owner: "C. Vogt", dept: "IT & Digital", age: 2, promised: 5 },
];

const STALL: Stall[] = [
  { reason: "Wrong department", days: 14, share: 0.41, note: "it went up the line instead of across to Logistics or Quality" },
  { reason: "Not responsible", days: 9, share: 0.26, note: "two shifts share the station, and neither owns the fault" },
  { reason: "No time → returned", days: 7, share: 0.21, note: "bounced back during the model-year changeover" },
  { reason: "Is it important", days: 4, share: 0.12, note: "the receiver could not rank it against the line target" },
];

const LEDGER: Ledger = {
  firstAnswer: "31 h", firstAnswerWas: "was 8 d", withinPromise: "81%", withinPromiseWas: "was 34%",
  escalated: 3, handedOver: 5, overrides: "2 of 18", overridesNote: "proposed owners were overruled, so the routing is right 9 times in 10",
};

const METRICS: Metrics = {
  discovery: { round: 1, interviewed: 240, note: "Paint shop and night shifts still under half" },
  signals: 86,
  ideaToDecision: { now: "5d", was: "was 14d", spark: [0.95, 1, 0.85, 0.7, 0.5, 0.4, 0.35] },
  valueBooked: { now: "€1.3M", delta: "+€610k", was: "was €690k", sub: "€820k of it recurring", spark: [0.2, 0.25, 0.3, 0.45, 0.6, 0.8, 1] },
  waitingDaysSaved: { now: "94 d", spark: [0.1, 0.2, 0.3, 0.5, 0.6, 0.8, 1] },
  shippedWas: "was 1", shippedSpark: [0.2, 0.25, 0.3, 0.5, 0.7, 0.85, 1],
  noOwnerWas: "was 3", noOwnerSpark: [0.7, 0.65, 0.6, 0.5, 0.4, 0.35, 0.3],
  contributing: { now: "86", was: "was 31", spark: [0.2, 0.3, 0.35, 0.45, 0.6, 0.8, 1] },
  stoppedEarly: 1,
  nextCall: "Thursday 14:00 · 25 min",
  answered: { replied: "77 of 86", median: "3d", credited: 41 },
  you: { medianWait: "3 d" },
  lead: { medianAnswer: "2 d", withinPromise: "9 / 11" },
};

const zi = (unitId: string | null, label: string, depth: number, headcount: number, participationPct: number, ideasPer100: number, implementationPct: number, medianDaysToDecision: number, savingsEur: number, energyKwh: number, co2Kg: number, premiumsEur: number): ZiRow => ({
  unitId, label, depth, headcount, participationPct, ideasPer100, implementationPct, medianDaysToDecision, savingsEur, energyKwh, co2Kg, premiumsEur, hidden: false,
});

/** The KPI report's figures while the sample data is on: that page reads only the server's counts. */
export const SAMPLE_KPIS: { company: ZiRow; units: ZiRow[] } = {
  company: zi(null, "Plant", 0, 8030, 23, 31, 38, 5, 1_310_000, 412_000, 148_000, 42_000),
  units: [
    zi("PRD", "Body & Assembly", 0, 4200, 26, 36, 41, 4, 860_000, 356_000, 128_000, 27_500),
    zi("ENG", "Vehicle Engineering", 0, 1800, 19, 24, 33, 7, 190_000, 8_000, 2_900, 6_000),
    zi("QUA", "Quality", 0, 600, 31, 44, 46, 4, 140_000, 0, 0, 4_500),
    zi("LOG", "Logistics", 0, 900, 22, 29, 36, 5, 95_000, 48_000, 17_100, 3_000),
    zi("PUR", "Purchasing", 0, 220, 14, 18, 25, 9, 15_000, 0, 0, 500),
    zi("HIT", "IT & Digital", 0, 310, 17, 21, 30, 6, 10_000, 0, 0, 500),
  ],
};

/**
 * The seed with the sample data in place of the company's own content. The company's seats and routes stay
 * in front, so a new case raised meanwhile still lands where the server sends it.
 *
 * Built around the viewer so that every role sees something on every page: three cases they raised, one
 * discussion they were asked into, a project they lead and two they are on; a leader or manager also holds
 * the desk with three open cases.
 */
export function withSampleData(base: Seed, viewer: SampleViewer, today: number): Seed {
  const day = (n: number) => today + n;
  const uid = viewer.userId;
  const me = viewer.name || "You";
  const raiser = viewer.handle ?? me;
  const holdsDesk = viewer.role !== "member" && uid !== null;
  const desk = holdsDesk ? me : "M. Hoffmann";
  const ev = (type: SeedEvent["type"], n: number, actor: string, payload?: SeedEvent["payload"]): SeedEvent =>
    ({ type, day: day(n), actor, actorUserId: actor === me || actor === raiser ? uid : null, ...(payload ? { payload } : {}) });
  // An event on the project a seeded yes opens: it rides on the case row, since that project has no row of its own.
  const onProject = (projectId: string, e: SeedEvent): SeedEvent => ({ ...e, target: projectId });

  const seats: SeatRow[] = [
    { id: "sample-seat-plant", roleId: "sample-role-plant", label: BOSS, userId: null, sort: 900 },
    { id: "sample-seat-desk", roleId: "sample-role-desk", label: desk, userId: holdsDesk ? uid : null, sort: 901 },
    { id: "sample-seat-eng", roleId: "sample-role-eng", label: "E. Wagner", userId: null, sort: 902 },
    { id: "sample-seat-qua", roleId: "sample-role-qua", label: "K. Yilmaz", userId: null, sort: 903 },
    { id: "sample-seat-log", roleId: "sample-role-log", label: "N. Demir", userId: null, sort: 904 },
    { id: "sample-seat-pur", roleId: "sample-role-pur", label: "P. Neumann", userId: null, sort: 905 },
  ];

  const routes: Route[] = [
    route("1", "Assembly faults, rework, station problems", ["seal", "robot", "rework", "station", "paint", "assembly"], "desk", desk, "Team lead, final assembly", "PRD", "S. Krüger", "K. Yilmaz · Quality"),
    route("2", "Test vehicles, prototypes, software flashing", ["test vehicle", "flash", "prototype", "software"], "eng", "E. Wagner", "Head of Vehicle Test", "ENG", "C. Vogt", "C. Vogt · IT & Digital"),
    route("3", "Quality data, torque records, inspection", ["quality", "torque", "inspection", "leak", "gauge"], "qua", "K. Yilmaz", "Head of Plant Quality", "QUA", "T. Richter", "M. Hoffmann · Body & Assembly"),
    route("4", "Inbound parts, sequencing, racks, packaging", ["harness", "sequence", "rack", "tray", "packaging", "logistics"], "log", "N. Demir", "Head of Inbound Logistics", "LOG", "J. Fischer", "P. Neumann · Purchasing"),
    route("5", "Suppliers, contracts, Tier-1 data", ["supplier", "tier-1", "contract", "purchasing"], "pur", "P. Neumann", "Lead Buyer, Interior", "PUR", "N. Demir", "N. Demir · Logistics"),
  ];

  const onSeat = (seat: string) => "sample-seat-" + seat;
  const cases: SeedCase[] = [
    // On the viewer's desk (or on M. Hoffmann's, for an employee).
    { id: "sample-c1", title: "Seam-sealing robot 14 drips after every nozzle change", from: "Anonymous #3187", fromDept: "Paint shop, shift B",
      routeId: "sample-r1", assignee: desk, assigneeRoleHolderId: onSeat("desk"), raisedDay: day(-6), reason: "no time", upside: "≈ 40 min rework per shift",
      body: "After each nozzle change the robot leaves a run of sealer on the rear wheel arch for the next three bodies. We wipe it by hand before the oven, off-plan." },
    // Raised to Logistics, passed on to the desk with a reason (plan NOR: the inbox says who passed it and why).
    { id: "sample-c2", title: "Wiring harness arrives out of sequence twice a week", from: "J. Fischer", fromDept: "Logistics, hall 5",
      routeId: "sample-r4", assignee: "N. Demir", assigneeRoleHolderId: onSeat("log"), raisedDay: day(-3), reason: "wrong department", upside: "≈ 45 min line stop a week",
      body: "The rack sequence and the build sequence drift apart when a body is pulled for rework. Station 31 finds out when the wrong harness is already in the car.",
      seedEvents: [
        ev("case.read", -3, "N. Demir"),
        { ...ev("case.handed", -2, "N. Demir", { to: desk, toRoleHolderId: onSeat("desk"), routeId: "sample-r1",
          why: "Our racks leave in build order. The drift starts when final assembly pulls a body for rework at station 31." }), actorUserId: "sample-user-demir" },
      ] },
    { id: "sample-c3", kind: "idea", title: "Scan battery-tray torque values instead of typing them", from: "L. Becker", fromDept: "Battery pack line",
      routeId: "sample-r3", assignee: desk, assigneeRoleHolderId: onSeat("desk"), raisedDay: day(-1), reason: "is it important", upside: "≈ 15 min per shift, no typing errors",
      body: "The torque tools already store each bolt's value, and we still type 24 numbers into the quality record per tray.\n\n" +
        "A scan at the end of the tray would send them across in one go. We could try it with one tool at one station for two weeks, for about €900 and a day of IT time. Still open: whether the audit accepts the scanned record." },

    // Raised by the viewer.
    { id: "sample-c4", kind: "idea", title: "Put welding robots into standby during shift breaks", from: raiser, fromUserId: uid, fromDept: "Body & Assembly",
      routeId: "sample-r1", assignee: BOSS, assigneeRoleHolderId: onSeat("plant"), raisedDay: day(-62), reason: "no time", upside: "≈ 8 % energy in each cell",
      body: "During breaks the body-shop robots hold position at full draw, with cooling and extraction running. A standby routine would cut that for 70 minutes of every shift.",
      seedEvents: [
        ev("case.read", -61, BOSS),
        ev("case.decided", -58, BOSS, { answer: "yes", note: "Yes. Prove it in one cell, and check the restart does not cost us cycle time." }),
      ] },
    { id: "sample-c5", title: "Test vehicles wait three days for a software flashing slot", from: raiser, fromUserId: uid, fromDept: "Body & Assembly",
      routeId: "sample-r2", assignee: "E. Wagner", assigneeRoleHolderId: onSeat("eng"), raisedDay: day(-4), reason: "not responsible", upside: "≈ 3 test days per vehicle",
      body: "There are two flashing benches for the whole test fleet, and they are booked by phone. A vehicle with a one-hour update can stand for three days.",
      seedEvents: [
        ev("case.read", -3, "E. Wagner"),
        ev("case.asked", -2, "E. Wagner", { text: "Which vehicle variants queue the longest? Then I can check whether a third bench solves it." }),
      ] },
    { id: "sample-c6", title: "Door-module racks block the walkway at station 42", from: raiser, fromUserId: uid, fromDept: "Body & Assembly",
      routeId: "sample-r4", assignee: "N. Demir", assigneeRoleHolderId: onSeat("log"), raisedDay: day(-1), reason: "wrong department", upside: "a safety risk on every shift",
      body: "Since the new rack size came in, full racks stand across the marked walkway while they wait for the tugger. People step around them with parts in their hands." },

    // A discussion the viewer was asked into; the idea it became waits for a decision.
    { id: "sample-c7", kind: "idea", title: "Let Tier-1 suppliers see our line-stop alerts live", from: "P. Neumann", fromDept: "Purchasing", linkedIdea: "sample-i1",
      routeId: "sample-r5", assignee: "P. Neumann", assigneeRoleHolderId: onSeat("pur"), raisedDay: day(-9), reason: "no time", upside: "≈ 30 % fewer stops from late parts",
      body: "Our sequence suppliers hear about a line stop by phone, often after they have shipped the next rack. A live alert would let them re-sequence an hour earlier.",
      seedEvents: [
        ev("case.read", -8, "P. Neumann"),
        ev("case.discussion", -6, "P. Neumann", { invited: [me, "N. Demir"], invitedUserIds: uid ? [uid] : [], missing: "Whether the supplier contracts and the works council allow sharing this data." }),
      ] },

    // Already decided: a no with its reason, and a yes that opened a project still being planned.
    { id: "sample-c8", kind: "idea", title: "An extra inspection gate after final assembly", from: "T. Richter", fromDept: "Quality",
      routeId: "sample-r3", assignee: "K. Yilmaz", assigneeRoleHolderId: onSeat("qua"), raisedDay: day(-40), reason: "is it important", upside: "fewer findings at customer audit",
      body: "A fourth gate before the customer audit would catch sealing and trim faults that pass the current checks.",
      seedEvents: [
        ev("case.read", -38, "K. Yilmaz"),
        ev("case.decided", -36, "K. Yilmaz", { answer: "no", category: "no-fit", reason: "A gate finds the fault later, it does not stop it. We fix the sealing at the source instead.",
          changeIf: "If the sealing fix has not brought the audit findings down by the end of the quarter." }),
        // The raiser asks for a second look (plan NOR, D18): it waits for whoever may answer it.
        ev("case.appealed", -3, "T. Richter", { text: "The sealing fix moved the audit findings by 2 % in five weeks. Please look at the gate again." }),
      ] },
    { id: "sample-c9", kind: "idea", title: "Returnable trays for door-module deliveries", from: "J. Fischer", fromDept: "Logistics",
      routeId: "sample-r4", assignee: "N. Demir", assigneeRoleHolderId: onSeat("log"), raisedDay: day(-12), reason: "no time", upside: "≈ €95k a year in one-way packaging",
      body: "Door modules arrive in cardboard we pay to dispose of, and our Tier-1 already runs returnable trays for another plant.",
      seedEvents: [
        ev("case.read", -11, "N. Demir"),
        // A yes that opens a draft and asks the viewer to lead it (plan SET, D8 to D11).
        ev("case.decided", -2, "N. Demir", { answer: "yes", note: "Yes. Agree the tray count with the supplier first.", projectId: "sample-pj2", lead: me, leadUserId: uid,
          title: "Returnable trays for door modules", draft: true, raiserNote: "Your tray idea is a go. The lead sets it up with the supplier now." }),
      ] },

    // Raised by the viewer and answered with a reasoned no: not now, what would change it, and the day it comes back (plan NOR).
    { id: "sample-c10", kind: "idea", title: "A heated rest area at the goods-in dock", from: raiser, fromUserId: uid, fromDept: "Body & Assembly",
      routeId: "sample-r4", assignee: "N. Demir", assigneeRoleHolderId: onSeat("log"), raisedDay: day(-30), reason: "no time", upside: "fewer sick days in winter",
      body: "The drivers and the goods-in team take their breaks in an unheated container. In January it is 6 °C in there.",
      seedEvents: [
        ev("case.read", -29, "N. Demir"),
        ev("case.decided", -26, "N. Demir", { answer: "no", category: "not-now", reason: "The dock is rebuilt next spring, and the rest area moves into the new building.",
          changeIf: "If the rebuild slips past April, we heat the current room this winter.", revisitDay: day(18) }),
      ] },
    // Raised by the viewer while the same problem was already open: Logistics closed it into that case (plan SEE, D17).
    { id: "sample-c11", title: "Harness racks out of order after a rework pull", from: raiser, fromUserId: uid, fromDept: "Body & Assembly",
      routeId: "sample-r4", assignee: "N. Demir", assigneeRoleHolderId: onSeat("log"), raisedDay: day(-3), reason: "wrong department", upside: "line stops at station 31",
      body: "Whenever a body leaves the line for rework, the next harness rack no longer matches the car in front of station 31.",
      seedEvents: [ev("case.merged", -2, "N. Demir", { into: "sample-c2", note: "Same drift as the open case from J. Fischer: one answer for both." })] },
    // A yes that waits for an approval: the cost is above Quality's limit, so final assembly's budget holder answers first (plan GAT, D21, D22).
    { id: "sample-c12", kind: "idea", title: "Leak-test fixtures for the second pack line", from: "L. Becker", fromDept: "Battery pack line",
      routeId: "sample-r3", assignee: "K. Yilmaz", assigneeRoleHolderId: onSeat("qua"), raisedDay: day(-7), reason: "no time", upside: "≈ 6 retests a day on line 2",
      body: "Line 2 shares one leak-test fixture with line 1, so packs queue for it at every shift start. Two fixtures of its own end the queue.",
      seedEvents: [
        ev("case.read", -6, "K. Yilmaz"),
        ev("case.costed", -5, "K. Yilmaz", { eur: 4800, basis: "Supplier quote for two fixtures; our maintenance fits them" }),
        ev("case.provisional", -3, "K. Yilmaz", {
          approvals: [{ kind: "budget", roleId: "sample-role-desk", coversUpToEur: 5000 }], stepDueDay: day(2), costEur: 4800, decidingRoleId: "sample-role-qua",
          projectId: "sample-pj7", lead: "L. Becker", title: "Leak-test fixtures, line 2", note: "Yes from Quality, if final assembly's budget carries the €4,800.",
        }),
      ] },
    // A draft someone else leads and is setting up: template, goal and baseline are in, and the viewer is invited onto the team (plan SET, D12 to D17).
    { id: "sample-c13", kind: "idea", title: "A gauge check at the start of every paint-shop shift", from: "A. Schulz", fromDept: "Paint shop, shift B",
      routeId: "sample-r3", assignee: "K. Yilmaz", assigneeRoleHolderId: onSeat("qua"), raisedDay: day(-15), reason: "is it important", upside: "film-thickness faults found an hour earlier",
      body: "The film-thickness gauge drifts over a shift, and we only notice at the weekly audit. A two-minute check against the reference plate at shift start would catch it.",
      seedEvents: [
        ev("case.read", -14, "K. Yilmaz"),
        ev("case.decided", -6, "K. Yilmaz", { answer: "yes", note: "Yes. T. Richter sets it up with the paint shop.", projectId: "sample-pj5", lead: "T. Richter", title: "Gauge check at every paint-shop shift start", draft: true }),
        onProject("sample-pj5", ev("project.template", -5, "T. Richter", { key: "quick-win", version: 1 })),
        onProject("sample-pj5", ev("project.goal", -5, "T. Richter", { goal: "Find a drifting film-thickness gauge within the shift it drifts.", doneWhen: "Every shift in the paint shop checks the gauge at start for four weeks.", doneBy: day(30) })),
        onProject("sample-pj5", ev("project.baseline", -4, "T. Richter", { metric: "film-thickness faults found at the weekly audit", unit: "per week", value: 9, better: "down", source: "Paint-shop audit log, 8 weeks" })),
        ...(uid ? [onProject("sample-pj5", ev("project.invited", -2, "T. Richter", { userId: uid, role: "member" }))] : []),
      ] },
    // Decided long ago; the project it became is the viewer's to lead (below).
    { id: "sample-c14", kind: "idea", title: "Pick-to-light for the clip boxes at station 18", from: "L. Becker", fromDept: "Battery pack line",
      routeId: "sample-r1", assignee: BOSS, assigneeRoleHolderId: onSeat("plant"), raisedDay: day(-40), reason: "no time", upside: "≈ 1 wrong clip a shift",
      body: "Station 18 picks from fourteen look-alike clip boxes. A light over the right box would end the wrong picks.",
      seedEvents: [ev("case.read", -38, BOSS), ev("case.decided", -30, BOSS, { answer: "yes", note: "Yes. Start with one station and count the wrong picks before and after." })] },
  ];

  const ideas: Idea[] = [
    { id: "sample-i1", title: "Line-stop alerts for Tier-1 suppliers", criteria: { fit: true, urgent: true, kpi: "line stops from late parts" }, problem: "sample-p1", status: "Awaiting decision", wait: 7,
      expected: "−30 % stops from late parts", upside: "€410k", effort: "2 people · 8 wks", proposedBy: "P. Neumann, Purchasing", blocker: "Needs Purchasing and the works council to agree what is shared.",
      rationale: "Publish a stop or re-sequence signal to the three sequence suppliers on one read-only feed. They can hold a rack that would arrive at the wrong moment. No vehicle or personal data leaves the plant.",
      team: ["P. Neumann", "N. Demir", me], teamNote: "The technology is small. The agreement on what is shared is what takes time." },
    { id: "sample-i2", title: "Use weld data to predict end-of-line findings", criteria: { fit: true, urgent: false, kpi: "first-pass yield" }, problem: "sample-p2", status: "Awaiting decision", wait: 3,
      expected: "findings a shift earlier", upside: "€260k", effort: "3 people · 10 wks", proposedBy: "T. Richter, Quality", blocker: "Shop-floor IT must open the controller data first.",
      rationale: "The controllers already log current and time for every spot weld. Comparing them with end-of-line findings for one body type shows whether a weak-weld flag can warn the line within the same shift.",
      team: ["T. Richter", "C. Vogt"], teamNote: "Starts with one body type, using data we already store." },
    { id: "sample-i3", title: "One retest rule for the battery leak test", criteria: { fit: true, urgent: true, kpi: "teardowns per week" }, problem: "sample-p3", status: "Shipped", wait: 0,
      expected: "−60 % teardowns", upside: "€180k", effort: "shipped in 5 wks", proposedBy: "L. Becker, Battery pack line",
      rationale: "A failed pack rests for 20 minutes and is retested once before anyone opens it. The limit stays the same, and a real leak still fails on the second run.",
      team: ["L. Becker", "K. Yilmaz", me], teamNote: "Shipped. Now standard on every shift." },
    { id: "sample-i4", title: "Digital shift handover at final assembly", criteria: { fit: false, urgent: false, kpi: "minutes to first full cycle" }, problem: "sample-p4", status: "In trial", wait: 0,
      expected: "12 min → 4 min", upside: "€120k", effort: "2 people · running", proposedBy: "M. Hoffmann, Body & Assembly",
      rationale: "Open faults go on a station tablet instead of a paper sheet, and the incoming shift reads them on the same screen. Running on two stations of line 2, with the second check still to come.",
      team: ["M. Hoffmann", "C. Vogt", me], teamNote: "Decide after the 90-day check whether it goes to the whole line." },
  ];

  const initiatives: Initiative[] = [
    { id: "sample-t1", name: "Standby for welding robots", depts: ["PRD", "HIT"], people: 3, status: "Building", stage: "day 41", why: "robots hold position at full draw during every break",
      members: [{ name: me, role: "Body & Assembly" }, { name: "C. Vogt", role: "IT & Digital" }, { name: "A. Schulz", role: "Body & Assembly" }] },
    { id: "sample-t2", idea: "sample-i4", name: "Digital shift handover", depts: ["PRD", "HIT"], people: 3, status: "In trial", stage: "day 34 of the check", why: "the next shift repeats what the last one already found",
      members: [{ name: "M. Hoffmann", role: "Body & Assembly" }, { name: "C. Vogt", role: "IT & Digital" }, { name: me, role: "Body & Assembly" }] },
    { id: "sample-t3", idea: "sample-i1", name: "Line-stop alerts for suppliers", depts: ["PRD", "PUR", "LOG"], people: 3, status: "Awaiting decision", stage: "waiting 7 days", why: "suppliers hear about a stop after it has happened",
      members: [{ name: "P. Neumann", role: "Purchasing" }, { name: "N. Demir", role: "Logistics" }, { name: me, role: "Body & Assembly" }], stuckOn: { name: BOSS, reason: "agreement with the works council" } },
    { id: "sample-t4", idea: "sample-i3", name: "Battery leak-test retest rule", depts: ["PRD", "QUA"], people: 2, status: "Shipped", stage: "shipped day 35", why: "the leak test failed good packs when the hall warmed up",
      members: [{ name: "L. Becker", role: "Body & Assembly" }, { name: "K. Yilmaz", role: "Quality" }] },
  ];

  const projects: SeedProject[] = [
    // Running, with a blocked step: raised by the viewer.
    { id: "sample-pj1", title: "Standby for welding robots during breaks", sources: ["sample-c4"], authors: [raiser], authorUserIds: uid ? [uid] : [], routeId: "sample-r1",
      lead: "A. Schulz", members: ["C. Vogt"], leadUserId: null, memberUserIds: [], openedDay: day(-58), openedBy: BOSS,
      seedEvents: [
        ev("project.baseline", -56, "A. Schulz", { metric: "energy per cell", unit: "kWh / shift", value: 620, better: "down", source: "Plant energy meter, cell 12, four weeks" }),
        ev("project.step.added", -56, "A. Schulz", { stepId: "s1", text: "Measure a full break in cell 12", owner: "A. Schulz" }),
        ev("project.step.added", -56, "A. Schulz", { stepId: "s2", text: "Write the standby and restart routine", owner: "C. Vogt", note: "Restart must be back at cycle time before the first body arrives." }),
        ev("project.step.added", -55, "A. Schulz", { stepId: "s3", text: "Safety sign-off for the restart sequence", owner: "A. Schulz", dueDay: day(6) }),
        ev("project.step.added", -55, "A. Schulz", { stepId: "s4", text: "Two-week trial in cell 12", owner: "A. Schulz", dueDay: day(20) }),
        ev("project.started", -54, "A. Schulz"),
        ev("project.step.moved", -53, "A. Schulz", { stepId: "s1", to: "done" }),
        ev("project.step.moved", -40, "C. Vogt", { stepId: "s2", to: "doing" }),
        ev("project.step.moved", -8, "C. Vogt", { stepId: "s2", to: "done" }),
        ev("project.step.moved", -5, "A. Schulz", { stepId: "s3", to: "blocked", why: "Waiting for the machine-safety review slot" }),
        ev("project.linked", -40, "C. Vogt", { system: "jira", key: "BS-41", url: "https://jira.example.com/browse/BS-41" }),
        // How the team works and what it reports each week (plan MOV, D16 to D19).
        ev("project.howwework", -53, "A. Schulz", { checkInWeekday: 2, note: "Ten minutes at cell 12 after the morning start-up." }),
        ev("project.update", -9, "A. Schulz", { week: day(-9), text: "Standby routine written and tested on the bench. Next: the safety review of the restart." }),
        ev("project.commented", -5, "A. Schulz", { text: "The routine works on the bench: back at cycle time in 40 seconds. Only the safety review is left before the trial." }),
        // The blocked step asks the desk above for help, and the done-by date moves once, with its reason (plan RES, D19; MOV, D15).
        ev("project.help.asked", -4, "A. Schulz", { stepId: "s3", text: "Can you get us a machine-safety review slot this month? The next free one is in five weeks." }),
        ev("project.doneby.moved", -4, "A. Schulz", { doneBy: day(28), why: "The safety review slot moves the trial by two weeks." }),
        ev("project.update", -4, "A. Schulz", { week: day(-4), text: "Blocked on the safety review slot. Asked for help to get one sooner; done-by moved two weeks." }),
      ] },
    // Measuring: the 30-day check came out better, the 90-day one is still to come.
    { id: "sample-pj3", title: "Digital shift handover, final assembly", sources: ["sample-i4"], authors: ["M. Hoffmann"], authorUserIds: [], routeId: "sample-r1",
      lead: "M. Hoffmann", members: ["C. Vogt", me], leadUserId: null, memberUserIds: uid ? [uid] : [], openedDay: day(-110), openedBy: BOSS,
      seedEvents: [
        ev("project.baseline", -108, "M. Hoffmann", { metric: "time to first full cycle after handover", unit: "min", value: 12, better: "down", source: "Line 2 start-of-shift timing, 20 shifts" }),
        ev("project.step.added", -108, "M. Hoffmann", { stepId: "s1", text: "Tablet form for open faults at two stations", owner: "C. Vogt" }),
        ev("project.step.added", -108, "M. Hoffmann", { stepId: "s2", text: "Run all three shifts on it for four weeks", owner: "M. Hoffmann" }),
        ev("project.step.added", -107, "M. Hoffmann", { stepId: "s3", text: "Add station 3 of line 2", owner: "C. Vogt" }),
        ev("project.started", -105, "M. Hoffmann"),
        ev("project.step.moved", -80, "C. Vogt", { stepId: "s1", to: "done" }),
        ev("project.step.moved", -40, "M. Hoffmann", { stepId: "s2", to: "done" }),
        // Done with one step dropped, and why (plan RES, D13).
        ev("project.done", -34, "M. Hoffmann", { note: "Live on two stations of line 2",
          openSteps: [{ stepId: "s3", end: "dropped", why: "Station 3 is rebuilt in spring and gets the tablet then." }] }),
        ev("project.measured", -4, "M. Hoffmann", { check: 30, value: 5, source: "Line 2 start-of-shift timing, 18 shifts" }),
      ] },
    // Finished, measured twice and recognised.
    { id: "sample-pj4", title: "One retest rule for the battery leak test", sources: ["sample-i3"], authors: ["L. Becker"], authorUserIds: [], routeId: "sample-r3",
      lead: "K. Yilmaz", members: ["L. Becker", me], leadUserId: null, memberUserIds: uid ? [uid] : [], openedDay: day(-190), openedBy: "K. Yilmaz",
      seedEvents: [
        ev("project.baseline", -188, "K. Yilmaz", { metric: "pack teardowns after a false fail", unit: "per week", value: 14, better: "down", source: "Pack line rework log, 8 weeks" }),
        ev("project.step.added", -188, "K. Yilmaz", { stepId: "s1", text: "Agree the rest time and the retest limit", owner: "K. Yilmaz" }),
        ev("project.step.added", -188, "K. Yilmaz", { stepId: "s2", text: "Update the work instruction on all shifts", owner: "L. Becker" }),
        ev("project.started", -186, "K. Yilmaz"),
        ev("project.step.moved", -170, "K. Yilmaz", { stepId: "s1", to: "done" }),
        ev("project.step.moved", -155, "L. Becker", { stepId: "s2", to: "done" }),
        ev("project.done", -151, "K. Yilmaz", { note: "Standard on every shift" }),
        ev("project.measured", -120, "K. Yilmaz", { check: 30, value: 5, source: "Pack line rework log, 4 weeks" }),
        ev("project.measured", -60, "K. Yilmaz", { check: 90, value: 4, source: "Pack line rework log, 12 weeks" }),
        ev("project.rewarded", -55, BOSS, { rule: "thanks", note: "Thanked at the plant meeting" }),
      ] },
    // Running and led by the viewer: today is the check-in, so this week's update is due (plan MOV, D18), and one step is late.
    { id: "sample-pj6", title: "Pick-to-light at station 18", sources: ["sample-c14"], authors: ["L. Becker"], authorUserIds: [], routeId: "sample-r1",
      lead: me, members: ["C. Vogt", "L. Becker"], leadUserId: uid, memberUserIds: [], openedDay: day(-30), openedBy: BOSS,
      seedEvents: [
        ev("project.baseline", -28, me, { metric: "wrong clips picked at station 18", unit: "per week", value: 11, better: "down", source: "End-of-line findings, station 18, six weeks" }),
        ev("project.step.added", -28, me, { stepId: "s1", text: "Mount the light bar over the 14 clip boxes", owner: "C. Vogt" }),
        ev("project.step.added", -28, me, { stepId: "s2", text: "Link the lights to the build sequence", owner: "C. Vogt", dueDay: day(-2) }),
        ev("project.step.added", -28, me, { stepId: "s3", text: "Two weeks on all shifts, count the wrong picks", owner: "L. Becker", dueDay: day(14) }),
        ev("project.howwework", -21, me, { checkInWeekday: 4, note: "Stand-up at station 18 at the shift change." }),
        ev("project.started", -20, me),
        ev("project.step.moved", -19, "C. Vogt", { stepId: "s1", to: "doing" }),
        ev("project.step.moved", -12, "C. Vogt", { stepId: "s1", to: "done" }),
        ev("project.step.moved", -11, "C. Vogt", { stepId: "s2", to: "doing" }),
        ev("project.update", -5, me, { week: day(-5), text: "Light bar is up. The sequence link needs a field from the MES that IT is adding." }),
        ev("project.commented", -3, "C. Vogt", { text: "The MES field is live in the test system. Production follows on Monday." }),
      ] },
    // Paused until the oven is back from its service (plan MOV, D17).
    { id: "sample-pj8", title: "Energy meter on the paint-shop ovens", sources: [], authors: ["A. Schulz"], authorUserIds: [], routeId: "sample-r1",
      lead: "A. Schulz", members: ["C. Vogt"], leadUserId: null, memberUserIds: [], openedDay: day(-45), openedBy: BOSS,
      seedEvents: [
        ev("project.baseline", -43, "A. Schulz", { metric: "energy per body in the paint ovens", unit: "kWh", value: 41, better: "down", source: "Monthly energy bill, split by hall" }),
        ev("project.step.added", -43, "A. Schulz", { stepId: "s1", text: "Meter on oven 1", owner: "C. Vogt" }),
        ev("project.step.added", -43, "A. Schulz", { stepId: "s2", text: "Meter on oven 2", owner: "C. Vogt" }),
        ev("project.started", -40, "A. Schulz"),
        ev("project.step.moved", -30, "C. Vogt", { stepId: "s1", to: "done" }),
        ev("project.doneby.moved", -6, "A. Schulz", { doneBy: day(20), why: "The yearly service of oven 2 moves its meter by three weeks." }),
        ev("project.paused", -6, "A. Schulz", { why: "Oven 2 is down for its yearly service; the meter goes in when it is back.", untilDay: day(9) }),
      ] },
    // Stopped, with the reason on the project (plan RES).
    { id: "sample-pj9", title: "Driverless tugger for door modules", sources: [], authors: ["J. Fischer"], authorUserIds: [], routeId: "sample-r4",
      lead: "N. Demir", members: ["J. Fischer"], leadUserId: null, memberUserIds: [], openedDay: day(-70), openedBy: "N. Demir",
      seedEvents: [
        ev("project.baseline", -68, "N. Demir", { metric: "tugger trips to station 42", unit: "per shift", value: 26, better: "down", source: "Tugger log, four weeks" }),
        ev("project.step.added", -68, "N. Demir", { stepId: "s1", text: "Trial route with the rented tugger", owner: "J. Fischer" }),
        ev("project.started", -66, "N. Demir"),
        ev("project.step.moved", -50, "J. Fischer", { stepId: "s1", to: "doing" }),
        ev("project.stopped", -10, "N. Demir", { why: "The returnable trays halve the trips it was meant to automate. We stop here and look again once they run." }),
      ] },
  ];

  const myJob = viewer.role === "member" ? "Line associate" : viewer.role === "leader" ? "Team lead, final assembly" : "Plant manager";
  const people = PEOPLE.some((p) => p.name === me) ? PEOPLE : [...PEOPLE, { name: me, role: myJob, dept: "PRD", reportsTo: viewer.role === "manager" ? null : BOSS }];

  return {
    ...base,
    depts: DEPTS, people, problems: PROBLEMS, ideas, initiatives, outcomes: OUTCOMES, cases, projects, waitingOn: WAITING_ON, buddies: BUDDIES,
    stall: STALL, ledger: LEDGER, metrics: METRICS, goals: GOALS, spend: base.spend ?? SPEND, briefs: undefined,
    seats: [...base.seats, ...seats], roles: [...(base.roles ?? []), ...ROLES], routes: [...base.routes, ...routes],
    leaders: [...new Set([...base.leaders, desk])],
  };
}
