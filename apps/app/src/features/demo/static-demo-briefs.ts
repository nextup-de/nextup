// What the raise page worked out for the static demo's three raised ideas (d1-d3 in static-demo.ts): the
// finalized document and the files, the five dials with what was checked across the company, who it
// affects and why, who receives it. Opening one of them on the Projects page shows all of it, as it would
// for an idea raised live (lib/raised.ts). People and departments are the demo's own (full names), routes
// and figures follow each case's seed fields.
import type { Block, Source, WrittenBrief } from "@/features/ideas/brief";

const text = (h: string, p: string, c: string[]): Block => ({ t: "text", h, p, c });
const facts = (items: [string, string, string[]][]): Block => ({ t: "facts", items: items.map(([k, v, c]) => ({ k, v, c })) });
const compare = (title: string, rows: [string, number, string, boolean?][], c: string[]): Block =>
  ({ t: "compare", title, c, rows: rows.map(([label, value, display, us]) => ({ label, value, display, us })) });
const quote = (h: string, q: string, who: string, role: string, c: string[]): Block => ({ t: "quote", h, q, who, role, c });
const src = (name: string, where: string, ext: Source["ext"]): Source => ({ name, where, ext });

const ME = "Jonas Schmidt";
const SHARED = {
  chat: src("Your conversation with NextUp", "Raise page · chat", "IDEA"),
  org: src("Org chart", "190 people in Production, 8 departments", "DATA"),
  map: src("Routing map", "Settings · Routing", "DATA"),
  cases: src("Open cases", "This company · all lines", "IDEA"),
};

const HANDOVER: WrittenBrief = {
  description: "Handover notes live in a binder in the break room, so the next shift reads them after the first problem instead of before it. A board at the line, filled in during the last ten minutes of the shift, gets read on the way in.",
  context: "The binder is read by about one in three people at the 06:00 and 14:00 handovers. The rest ask around at the line, which takes about ten minutes before the first part runs.",
  prompts: [
    { label: "Solves", text: "The next shift learns about open problems after the first one hits them" },
    { label: "Impact", text: "≈ 10 min per handover, three handovers a day on line 3" },
    { label: "Who’s blocked", text: "Operators and setters starting a shift on line 3" },
    { label: "Already tried", text: "A WhatsApp group in spring; it was muted within a month" },
  ],
  files: [
    { name: "Move-the-shift-handover-notes-onto-a-board-by-the-line.pdf", size: "Idea document" },
    { name: "handover-binder-photos.pdf", size: "2.4 MB" },
    { name: "handover-delays-sept.xlsx", size: "38 KB" },
  ],
  categories: ["Shift plan, staffing, overtime", "Production", "Idea"],
  affects: {
    depts: ["PRD"], people: ["Stefan Dahl", "Jan Klein", "Thomas Vogel"],
    ai: ["Jan Klein", "Thomas Vogel"],
    why: { "Jan Klein": "Line 2 hands over at the same times and uses the same binder.", "Thomas Vogel": "Owns the shift plan, so the handover routine is his to change." },
  },
  scores: [
    { value: 70, note: "About ten minutes saved at every handover, three times a day.", blocks: [
      text("Where the time goes", "The delay log for September shows 61 handovers on line 3. In 44 of them the first part ran more than eight minutes after the shift started, and the most common note is “asked what happened on the last shift”.", ["log"]),
      compare("Minutes before the first part runs", [["Line 3 today", 11, "11 min", true], ["Line 4 (board at the line)", 3, "3 min"]], ["log", "l4"]),
    ] },
    { value: 85, note: "A whiteboard and a ten-minute slot at the end of the shift. No system change.", blocks: [
      text("Why it is simple", "Line 4 has run a board at the line entrance since last year. The shift lead writes it during the last ten minutes; the night shift fills it at 21:50 so nobody writes it at 22:00 while already at the press.", ["l4", "chat"]),
    ] },
    { value: 90, note: "About €150 for a board and markers, inside the team’s own budget.", blocks: [
      facts([["Board", "≈ €120", ["chat"]], ["Markers and magnets", "≈ €30", ["chat"]], ["Time", "10 min at the end of each shift, already in the shift plan", ["plan"]]]),
    ] },
    { value: 75, note: "Supports the 2026 goal that no shift starts blind.", blocks: [
      text("How it lines up", "Shift handover is a named topic in the production goals for 2026, and the routing map gives shift-plan decisions to the team lead, so it needs no one else’s sign-off.", ["goals", "map"]),
    ] },
    { value: 80, note: "Low. The only risk is that the board is not kept up.", blocks: [
      text("What could go wrong", "A board nobody updates is worse than a binder. Line 4 avoided that by making the last ten minutes of the shift a fixed slot on the shift plan.", ["l4", "plan"]),
      quote("From the line", "On line 4 I read the board on the way in. On line 3 I ask whoever is still there.", "Stefan Dahl", "Line 3", ["chat"]),
    ] },
  ],
  summary: "Move the shift handover notes from the break-room binder onto a board at line 3, written in the last ten minutes of each shift. It saves about ten minutes per handover and costs about €150.",
  lead: "In 44 of 61 handovers in September the first part ran more than eight minutes late, mostly because the next shift asked around instead of reading the binder.",
  bars: { title: "Minutes before the first part runs", rows: [{ label: "Line 3 today", value: 11, display: "11 min" }, { label: "Line 4, board at the line", value: 3, display: "3 min" }], note: "Line 4 already works this way." },
  after: "Advice when it was raised: Approve. Clear, cheap, and the decision is the team lead’s own.",
  rec: "approve",
  recText: "Line 4 shows it works, the cost is inside the team’s budget and the shift plan already has the slot.",
  next: "", by: "",
  questions: ["Which board: the one at the line entrance or the team board by the coffee machine?", "Who writes the notes at 22:00, when the shift lead is already at the press?"],
  pattern: "Line 2 has raised the same handover delay twice this year; both times it was solved for one shift only.",
  similar: [
    { title: "Shift board at the line entrance", where: "Production, Line 4 · 2025", status: "Done", match: 88, note: "Cut the start-up delay from eleven to three minutes." },
    { title: "Handover checklist for the night shift", where: "Production, Line 2 · 2026", status: "Open", match: 61 },
  ],
  routing: [
    { name: "Thomas Vogel", role: "Team lead, 4-series", why: "Owns “Shift plan, staffing, overtime” on the routing map; the handover routine is his." },
    { name: "Hans Sander", role: "Quality lead", why: "Deputy on the map: the idea moves to him if the five-day promise is missed." },
  ],
  cites: { summary: ["log"], lead: ["log"], bars: ["log", "l4"], after: ["doc"], rec: ["l4"], pattern: ["cases"], similar: ["l4"] },
  sources: {
    ...SHARED,
    doc: src("Move-the-shift-handover-notes-onto-a-board-by-the-line.pdf", "Idea document · " + ME, "PDF"),
    log: src("handover-delays-sept.xlsx", "Attached by " + ME, "XLSX"),
    photos: src("handover-binder-photos.pdf", "Attached by " + ME, "PDF"),
    l4: src("Line 4 shift board, since 2025", "Production · Line 4", "DATA"),
    plan: src("Shift plan, 4-series", "Production · Shift planning", "XLSX"),
    goals: src("Production goals 2026", "SharePoint · Production", "PDF"),
  },
  feed: { supporters: 6, sentiment: "Positive. Line 2 wants the same.", comments: [
    { name: "Stefan Dahl", role: "Line 3", text: "Yes please. Put it where we walk in, not by the coffee.", daysAgo: 1 },
    { name: "Jan Klein", role: "Line 2", text: "If it works, we copy it on line 2.", daysAgo: 1 },
  ] },
};

const EAR: WrittenBrief = {
  description: "We only stock one size. On smaller heads it slips, so people take it off at the loud press - exactly where they need it most.",
  context: "The press runs at about 94 dB(A). Four people on the day shift and six on nights need a smaller size.",
  prompts: [
    { label: "Solves", text: "Ear defenders slip on smaller heads and come off at the press" },
    { label: "Impact", text: "10 people protected at the press" },
    { label: "Cost", text: "≈ €25 a pair, €250 in total" },
  ],
  files: [
    { name: "Ear-defenders-in-two-sizes-at-the-press.pdf", size: "Idea document" },
    { name: "noise-measurement-press-2026.pdf", size: "640 KB" },
    { name: "ear-defender-quote-size-S.pdf", size: "120 KB" },
  ],
  categories: ["Spend under €5k (parts, tools, consumables)", "Safety", "Idea"],
  affects: {
    depts: ["PRD", "HIT"], people: ["Stefan Dahl", "Thomas Vogel"],
    ai: ["HIT"],
    why: { HIT: "HR keeps the protective-equipment register and orders the stock." },
  },
  scores: [
    { value: 75, note: "Ten people keep their hearing protection on at a 94 dB(A) press.", blocks: [
      text("Why it matters", "The noise measurement from March puts the press at 94 dB(A), above the 85 dB(A) limit where hearing protection is mandatory. Taking it off for a few minutes an hour already exceeds the daily dose.", ["noise"]),
    ] },
    { value: 95, note: "Order a second size from the existing supplier.", blocks: [
      facts([["Supplier", "Same as today, size S in stock", ["quote"]], ["Delivery", "3 working days", ["quote"]]]),
    ] },
    { value: 90, note: "€250 in total, well under the team’s €500 limit.", blocks: [
      facts([["Per pair", "≈ €25", ["quote"]], ["Pairs", "10", ["chat"]], ["Total", "€250", ["quote"]], ["Team limit", "€500 without sign-off", ["map"]]]),
    ] },
    { value: 80, note: "Fits the safety goals; protective equipment must fit the wearer.", blocks: [
      text("How it lines up", "The protective-equipment rules require gear that fits the person wearing it. One size for everyone does not meet that.", ["ppe"]),
    ] },
    { value: 90, note: "Very low. The risk is in not doing it.", blocks: [
      text("What could go wrong", "Nothing on the purchase side. Leaving it means people keep taking the protection off at the loudest machine on the line.", ["noise"]),
    ] },
  ],
  summary: "Stock ear defenders in a second, smaller size at the press. Ten people need it; it costs about €250, inside the team’s own spending limit.",
  lead: "The press runs at 94 dB(A). The one size in stock slips on smaller heads, so people take it off where they need it most.",
  after: "Advice when it was raised: Approve. A safety point with a small spend; the team lead can say yes on his own.",
  rec: "approve",
  recText: "Cheap, clear and a safety requirement. The spend is inside the team’s limit.",
  next: "", by: "",
  questions: [],
  pattern: "Two other safety requests this year were about protective equipment that does not fit.",
  similar: [{ title: "Gloves in three sizes for the assembly line", where: "Production, Line 2 · 2025", status: "Done", match: 72 }],
  routing: [
    { name: "Thomas Vogel", role: "Team lead, 4-series", why: "Owns “Spend under €5k” on the routing map, and €250 is inside his limit." },
    { name: "Markus Roth", role: "Engineering lead", why: "Deputy on the map: the idea moves to him if the five-day promise is missed." },
  ],
  cites: { summary: ["quote"], lead: ["noise"], after: ["doc"], rec: ["map"], pattern: ["cases"], similar: ["cases"] },
  sources: {
    ...SHARED,
    doc: src("Ear-defenders-in-two-sizes-at-the-press.pdf", "Idea document · " + ME, "PDF"),
    noise: src("noise-measurement-press-2026.pdf", "Attached by " + ME, "PDF"),
    quote: src("ear-defender-quote-size-S.pdf", "Attached by " + ME, "PDF"),
    ppe: src("Protective equipment rules", "SharePoint · Health and safety", "PDF"),
  },
  feed: { supporters: 9, sentiment: "Positive. The night shift asked for it before.", comments: [
    { name: "Stefan Dahl", role: "Line 3", text: "Mine slip every time I bend over the die.", daysAgo: 3 },
  ] },
};

const LAMPS: WrittenBrief = {
  description: "The inspection table at the end of line 3 has one yellow ceiling light. Fine scratches only show in daylight, so the customer finds them instead of us.",
  context: "Two or three complaints a month come back from the customer, all of them fine scratches the final check should have caught.",
  prompts: [
    { label: "Solves", text: "Fine scratches pass the final check under yellow light" },
    { label: "Impact", text: "Fewer scratches found by the customer: 2-3 complaints a month today" },
    { label: "Cost", text: "Two daylight lamps, ≈ €340 with mounting" },
  ],
  files: [
    { name: "Daylight-lamps-above-the-inspection-table.pdf", size: "Idea document" },
    { name: "customer-complaints-q3.xlsx", size: "52 KB" },
    { name: "lamp-offer-daylight-5000K.pdf", size: "210 KB" },
  ],
  categories: ["Fixture, tooling or line layout", "Quality", "Idea"],
  affects: {
    depts: ["PRD", "QUA", "SAL"], people: ["Hans Sander", "Anna Weber"],
    ai: ["QUA", "SAL", "Anna Weber"],
    why: { QUA: "Quality owns the final check and the complaint figures.", SAL: "Sales handles the complaints with the customer.", "Anna Weber": "Key account for the customer who sends the complaints back." },
  },
  scores: [
    { value: 80, note: "Two to three customer complaints a month, each with rework and a credit note.", blocks: [
      text("What it costs today", "Q3 has eight complaints for fine scratches, all on parts that passed the final check at line 3. Each one means a return, rework and a credit note.", ["compl"]),
      compare("Scratch complaints per month", [["Line 3", 2.7, "2.7", true], ["Line 4 (daylight lamps)", 0.3, "0.3"]], ["compl"]),
    ] },
    { value: 85, note: "Two lamps on the existing frame; maintenance mounts them in an afternoon.", blocks: [
      text("Why it is simple", "Line 4’s inspection table has had two 5000 K lamps since 2024. The frame above the line 3 table takes the same mounting.", ["offer"]),
    ] },
    { value: 85, note: "≈ €340 with mounting, inside the team’s limit.", blocks: [
      facts([["Two lamps, 5000 K", "≈ €280", ["offer"]], ["Mounting", "≈ €60, maintenance", ["offer"]]]),
    ] },
    { value: 75, note: "Supports the 2026 quality goal of fewer customer complaints.", blocks: [
      text("How it lines up", "Customer complaints are one of the three quality figures for 2026, and line 3 accounts for most of the scratch complaints.", ["compl"]),
    ] },
    { value: 85, note: "Low. Glare at the table is the only thing to check.", blocks: [
      text("What could go wrong", "Lamps placed too low dazzle the inspector. Line 4 hung them at 1.2 m above the table without complaints.", ["offer"]),
    ] },
  ],
  summary: "Hang two daylight lamps above the inspection table at the end of line 3, so fine scratches show at the final check. About €340; line 4 already works this way.",
  lead: "Eight scratch complaints in Q3 came from parts that passed the final check at line 3 under one yellow ceiling light.",
  bars: { title: "Scratch complaints per month", rows: [{ label: "Line 3", value: 2.7, display: "2.7" }, { label: "Line 4, daylight lamps", value: 0.3, display: "0.3" }], note: "From the attached complaint list, Q3." },
  after: "Advice when it was raised: Approve. The number the person who decides needs is in the attachment.",
  rec: "approve",
  recText: "Small spend, clear cost of doing nothing, and line 4 shows the effect.",
  next: "", by: "",
  questions: ["Can maintenance mount them this month?"],
  pattern: "Scratch complaints cluster on line 3; the other lines have daylight at inspection.",
  similar: [{ title: "Daylight lamps at the line 4 inspection table", where: "Production, Line 4 · 2024", status: "Done", match: 91 }],
  routing: [
    { name: "Thomas Vogel", role: "Team lead, 4-series", why: "Owns “Fixture, tooling or line layout” on the routing map." },
    { name: "Markus Roth", role: "Engineering lead", why: "Deputy on the map. The promise was missed, so the idea moved to him." },
  ],
  cites: { summary: ["offer"], lead: ["compl"], bars: ["compl"], after: ["doc"], rec: ["compl"], pattern: ["compl"], similar: ["offer"] },
  sources: {
    ...SHARED,
    doc: src("Daylight-lamps-above-the-inspection-table.pdf", "Idea document · " + ME, "PDF"),
    compl: src("customer-complaints-q3.xlsx", "Attached by " + ME, "XLSX"),
    offer: src("lamp-offer-daylight-5000K.pdf", "Attached by " + ME, "PDF"),
  },
  feed: { supporters: 4, sentiment: "Positive. Quality is for it.", comments: [
    { name: "Hans Sander", role: "Quality lead", text: "Agreed. Line 4 has had almost none since the lamps went up.", daysAgo: 6 },
  ] },
};

export const STATIC_DEMO_BRIEFS: Record<string, WrittenBrief> = { d1: HANDOVER, d2: EAR, d3: LAMPS };
