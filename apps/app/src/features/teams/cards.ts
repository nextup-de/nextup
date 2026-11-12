// What Teams shows (TMS D11; page spec 06 § Teams). Adaptive Cards 1.5, built as plain data. Pure: no I/O.
// Every text comes from the `teams` namespace in the recipient's locale. The caller hands in dates and names
// already formatted for the recipient; a card never looks anything up.
import { noCategoryLabel, PASS_REASON_MIN, type NoCategory } from "@/features/cases/no";
import { createT, INTL_LOCALE, type Locale, type MessageKey } from "@/i18n";

/** When an earlier answer was given, for the caller to hand in: the time on the same day, else date and time. */
export function decidedAt(ts: number, locale: Locale, now: number = Date.now(), timeZone?: string): string {
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  const time: Intl.DateTimeFormatOptions = { timeZone, hour: "2-digit", minute: "2-digit" };
  const opts: Intl.DateTimeFormatOptions = day(ts) === day(now) ? time : { ...time, day: "2-digit", month: "2-digit" };
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], opts).format(ts);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json | undefined };
/** One element or action of a card. */
export type CardNode = { type: string } & { [k: string]: Json | undefined };
export type Card = {
  type: "AdaptiveCard";
  $schema: string;
  version: "1.5";
  body: CardNode[];
  actions?: CardNode[];
};

export type CardSeat = { id: string; label: string };

/** Everything the cards need. Each builder reads only the fields its card shows. */
export type CardInput = {
  /** The case; what a submit sends back. Required for raisedCard and reminderCard. */
  caseId?: string;
  /** The outbox row id; what a submit sends back. Required for raisedCard and reminderCard. */
  cardId?: string;
  title?: string;
  /** The case page (or the inbox). */
  link?: string;
  /** NextUp's mark, an absolute https URL; without it the header has no image. */
  markUrl?: string;
  kind?: "problem" | "idea";
  body?: string;
  fromUnit?: string;
  routeLabel?: string;
  /** The answer-by date, formatted. */
  answerBy?: string;
  workingDays?: number;
  deputy?: string | null;
  /** The seats the case can be handed to (holders of other roles). */
  seats?: CardSeat[];
  /** reminderCard: the desk, or the escalation seat. */
  variant?: "desk" | "escalation";
  /** reminderCard desk: who sees it now; escalation: the desk that did not answer. confirmCard: the desk it is on. */
  role?: string;
  /** The promise in days. */
  days?: number;
  raised?: string;
  due?: string;
  daysLate?: number;
  /** textCard. */
  subject?: string;
  text?: string;
  /** raiseTask and confirmCard. */
  company?: string;
  visibility?: "everyone" | "private";
  sandbox?: boolean;
  /** confirmCard: what happened. Default "raised". */
  outcome?: "raised" | "yes" | "no" | "ask" | "handed" | "answeredBy";
  time?: string;
  name?: string;
  /** notSetUpCard. Default "off". */
  reason?: "unknown" | "off" | "notSetUp";
  /** The fewest characters a reason for a no needs (company rule no_reason_min); the hint on the card says it. Default 40. */
  noReasonMin?: number;
};

export const SUBMIT_KINDS = ["answer", "handover"] as const;
export type SubmitKind = (typeof SUBMIT_KINDS)[number];

export const MAX_CARD_BYTES = 28 * 1024;
export const MAX_SEATS = 150;
export const ANSWER_TEXT_MAX = 1000;
export const WHY_MAX = 500;
/** What would make it a yes: up to this many characters (plan NOR, D17). */
export const CHANGE_IF_MAX = 400;
/** The company rule's default, for a card built without it. */
const NO_REASON_MIN_DEFAULT = 40;
/** The categories the card offers for a no: Already solved or in work needs a link to the case or project, so it is in NextUp (D22). */
export const CARD_NO_CATEGORIES = ["not-now", "no-budget", "no-fit", "risk", "not-feasible"] as const satisfies readonly NoCategory[];
export type CardNoCategory = (typeof CARD_NO_CATEGORIES)[number];
export const RAISE_TITLE_MAX = 120;
export const RAISE_BODY_MAX = 2000;

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
const ID_MAX = 128;
const SHOWN_TITLE_MAX = 200;
// The body shows five lines (maxLines below): this many characters are more than the card can show, and keep a card with 150 seats under the limit.
const SHOWN_BODY_MAX = 600;
const SHOWN_LABEL_MAX = 100;

const clamp = (s: string, max: number): string => {
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : s;
};

function tb(text: string, extra: Record<string, Json> = {}): CardNode {
  return { type: "TextBlock", text, wrap: true, ...extra };
}

function header(kind: string, markUrl?: string): CardNode {
  const columns: CardNode[] = [];
  if (markUrl) {
    columns.push({ type: "Column", width: "auto", items: [{ type: "Image", url: markUrl, width: "24px", height: "24px", altText: "NextUp" }] });
  }
  columns.push({ type: "Column", width: "stretch", verticalContentAlignment: "Center", items: [tb(kind, { size: "small", isSubtle: true })] });
  return { type: "ColumnSet", columns };
}

const factSet = (facts: [string, string][]): CardNode => ({
  type: "FactSet",
  facts: facts.map(([title, value]) => ({ title, value })),
});

const openUrl = (title: string, url: string, positive = false): CardNode => ({
  type: "Action.OpenUrl",
  title,
  url,
  ...(positive ? { style: "positive" } : {}),
});

const card = (body: CardNode[], actions?: CardNode[]): Card => ({
  type: "AdaptiveCard",
  $schema: SCHEMA,
  version: "1.5",
  body,
  ...(actions && actions.length ? { actions } : {}),
});

/** The inner card of an Action.ShowCard. */
const inner = (body: CardNode[], actions: CardNode[]): CardNode => ({ type: "AdaptiveCard", body, actions });

type Tr = ReturnType<typeof createT>;
type Ids = { caseId: string; cardId: string };

function ids(input: CardInput): Ids {
  return { caseId: input.caseId ?? "", cardId: input.cardId ?? "" };
}

function answerForm(input: CardInput, t: Tr): CardNode {
  const idea = input.kind === "idea";
  const min = input.noReasonMin ?? NO_REASON_MIN_DEFAULT;
  const choices = [
    ...(idea ? [] : [{ title: t("teams.choiceYes"), value: "yes" }]),
    { title: t("teams.choiceNo"), value: "no" },
    { title: t("teams.choiceAsk"), value: "ask" },
  ];
  // The fields of a no sit with the rest: a card cannot hide them until No is picked. The card checks them when it is sent.
  const body: CardNode[] = [
    { type: "Input.ChoiceSet", id: "answer", label: t("teams.answerLabel"), style: "expanded", isRequired: true, errorMessage: t("teams.errorNoText"), choices },
    {
      type: "Input.ChoiceSet", id: "category", label: t("teams.categoryLabel"), style: "compact", placeholder: t("teams.categoryPlaceholder"),
      choices: CARD_NO_CATEGORIES.map((c) => ({ title: t(noCategoryLabel(c)), value: c })),
    },
    { type: "Input.Text", id: "text", label: t("teams.textLabel"), isMultiline: true, maxLength: ANSWER_TEXT_MAX, errorMessage: t("teams.errorNoText") },
    tb(t("teams.textHint", { n: min }), { size: "small", isSubtle: true }),
    { type: "Input.Text", id: "changeIf", label: t("teams.changeIfLabel"), isMultiline: true, maxLength: CHANGE_IF_MAX },
    { type: "Input.Date", id: "revisitDay", label: t("teams.revisitLabel") },
  ];
  if (idea) body.push(tb(t("teams.ideaLine"), { size: "small", isSubtle: true }));
  // Discuss first, Already solved or in work and Send up are not on the card (D22): one button leads to the case.
  const actions: CardNode[] = [
    { type: "Action.Submit", title: t("teams.sendAnswer"), style: "positive", data: { kind: "answer", ...ids(input) } },
  ];
  if (idea && input.link) actions.push(openUrl(t("teams.actionSayYes"), input.link));
  if (input.link) actions.push(openUrl(t("teams.actionOpen"), input.link));
  return inner(body, actions);
}

function handOverForm(input: CardInput, t: Tr): CardNode {
  const seats = input.seats ?? [];
  if (seats.length > MAX_SEATS) {
    const actions = input.link ? [openUrl(t("teams.actionOpen"), input.link, true)] : [];
    return inner([tb(t("teams.tooManyRoles"))], actions);
  }
  return inner(
    [
      {
        type: "Input.ChoiceSet",
        id: "toSeatId",
        label: t("teams.handOverLabel"),
        style: "filtered",
        isRequired: true,
        placeholder: t("teams.searchPlaceholder"),
        choices: seats.map((s) => ({ title: clamp(s.label, SHOWN_LABEL_MAX), value: s.id })),
      },
      {
        type: "Input.Text", id: "why", label: t("teams.whyLabel"), isMultiline: true, maxLength: WHY_MAX, isRequired: true,
        regex: `^[\\s\\S]{${PASS_REASON_MIN},}$`, errorMessage: t("teams.errorWhyShort", { n: PASS_REASON_MIN }),
      },
      tb(t("teams.handOverHint", { n: PASS_REASON_MIN }), { size: "small", isSubtle: true }),
    ],
    [{ type: "Action.Submit", title: t("teams.handOverButton"), style: "positive", data: { kind: "handover", ...ids(input) } }],
  );
}

function answerActions(input: CardInput, t: Tr): CardNode[] {
  return [
    { type: "Action.ShowCard", title: t("teams.actionAnswer"), style: "positive", card: answerForm(input, t) },
    { type: "Action.ShowCard", title: t("teams.actionHandOver"), card: handOverForm(input, t) },
    ...(input.link ? [openUrl(t("teams.actionOpen"), input.link)] : []),
  ];
}

const titleBlock = (title: string | undefined): CardNode =>
  tb(clamp(title ?? "", SHOWN_TITLE_MAX), { size: "large", weight: "bolder" });

const answerByValue = (input: CardInput, t: Tr): string =>
  t("teams.answerByValue", { date: input.answerBy ?? "", count: input.workingDays ?? 0 });

/** The new case on a desk (template `raised`). */
export function raisedCard(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  const facts: [string, string][] = [];
  if (input.fromUnit) facts.push([t("teams.factFrom"), input.fromUnit]);
  if (input.routeLabel) facts.push([t("teams.factRoute"), input.routeLabel]);
  if (input.answerBy) facts.push([t("teams.factAnswerBy"), answerByValue(input, t)]);
  if (input.deputy) facts.push([t("teams.factDeputy"), input.deputy]);
  return card(
    [
      header(t("teams.kindRaised"), input.markUrl),
      titleBlock(input.title),
      ...(input.body ? [tb(clamp(input.body, SHOWN_BODY_MAX), { maxLines: 5 })] : []),
      ...(facts.length ? [factSet(facts)] : []),
    ],
    answerActions(input, t),
  );
}

/** A deadline reminder: to the desk, or to the seat it escalated to. */
export function reminderCard(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  const escalation = input.variant === "escalation";
  const params = { role: input.role ?? "", days: input.days ?? 0 };
  const late = input.daysLate ?? 0;
  const body: CardNode[] = [
    header(t(escalation ? "teams.kindDeadlineEscalation" : "teams.kindDeadlineDesk"), input.markUrl),
    titleBlock(input.title),
    tb(t(escalation ? "teams.sentenceEscalation" : "teams.sentenceDesk", params)),
  ];
  if (input.raised) body.push(factSet([[t("teams.factRaised"), input.raised]]));
  if (input.due) {
    const columns: CardNode[] = [
      { type: "Column", width: "auto", items: [tb(t("teams.factWasDue"), { weight: "bolder" })] },
      { type: "Column", width: "auto", items: [tb(input.due)] },
    ];
    if (late > 0) {
      columns.push({ type: "Column", width: "auto", items: [tb(t("teams.late", { count: late }), { color: "attention" })] });
    }
    body.push({ type: "ColumnSet", columns });
  }
  if (input.fromUnit) body.push(factSet([[t("teams.factFrom"), input.fromUnit]]));
  return card(body, answerActions(input, t));
}

/** Every other template: the subject, the text and a link. */
export function textCard(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  return card(
    [
      header(clamp(input.subject ?? "", SHOWN_TITLE_MAX), input.markUrl),
      ...(input.title ? [titleBlock(input.title)] : []),
      tb(clamp(input.text ?? "", SHOWN_BODY_MAX * 4)),
    ],
    input.link ? [openUrl(t("teams.actionOpen"), input.link, true)] : [],
  );
}

/** The message extension's form (step 1 of the raise dialog). */
export function raiseTask(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  const company = input.company ?? "";
  return card(
    [
      tb(t("teams.raiseTitle"), { size: "medium", weight: "bolder" }),
      {
        type: "Input.ChoiceSet",
        id: "kind",
        label: t("teams.kindLabel"),
        style: "expanded",
        value: input.kind === "idea" ? "idea" : "problem",
        choices: [
          { title: t("teams.kindProblem"), value: "problem" },
          { title: t("teams.kindIdea"), value: "idea" },
        ],
      },
      {
        type: "Input.Text",
        id: "title",
        label: t("teams.titleLabel"),
        isRequired: true,
        errorMessage: t("teams.errorNoTitle"),
        maxLength: RAISE_TITLE_MAX,
        value: clamp(input.title ?? "", RAISE_TITLE_MAX),
      },
      {
        type: "Input.Text",
        id: "body",
        label: t("teams.bodyLabel"),
        isMultiline: true,
        maxLength: RAISE_BODY_MAX,
        value: clamp(input.body ?? "", RAISE_BODY_MAX),
      },
      {
        type: "Input.ChoiceSet",
        id: "visibility",
        label: t("teams.visibilityLabel"),
        style: "compact",
        value: input.visibility === "private" ? "private" : "everyone",
        choices: [
          { title: t("teams.visibilityEveryone", { company }), value: "everyone" },
          { title: t("teams.visibilityPrivate"), value: "private" },
        ],
      },
    ],
    [{ type: "Action.Submit", title: t("teams.next"), style: "positive", data: { step: 1 } }],
  );
}

const RESULT_KEYS = {
  yes: "teams.resultYes",
  no: "teams.resultNo",
  ask: "teams.resultAsk",
  handed: "teams.resultHanded",
  answeredBy: "teams.resultAnsweredBy",
} as const satisfies Record<string, MessageKey>;

/** After a raise, an answer or a hand-over. */
export function confirmCard(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  const outcome = input.outcome ?? "raised";
  const body: CardNode[] = [];
  if (outcome === "raised") {
    body.push(header(t("teams.kindConfirmed"), input.markUrl), titleBlock(input.title));
    body.push(tb(t("teams.confirmSentence", { role: input.role ?? "" })));
    const facts: [string, string][] = [];
    if (input.answerBy) facts.push([t("teams.factAnswerBy"), input.answerBy]);
    facts.push([
      t("teams.factSeenBy"),
      input.visibility === "private" ? t("teams.seenByPrivate") : t("teams.seenByEveryone", { company: input.company ?? "" }),
    ]);
    body.push(factSet(facts));
  } else {
    body.push(header(t("teams.kindDone"), input.markUrl), titleBlock(input.title));
    body.push(tb(t(RESULT_KEYS[outcome], { time: input.time ?? "", role: input.role ?? "", name: input.name ?? "" }), { color: "accent" }));
  }
  if (input.sandbox) body.push(tb(t("teams.sandboxLine"), { size: "small", color: "warning" }));
  return card(body, input.link ? [openUrl(t("teams.actionOpen"), input.link, true)] : []);
}

/** An unknown person, or Teams off for the company. */
export function notSetUpCard(input: CardInput, locale: Locale): Card {
  const t = createT(locale);
  const reason = input.reason ?? "off";
  const text =
    reason === "unknown"
      ? t("teams.notLinked", { company: input.company ?? "" })
      : reason === "notSetUp"
        ? t("teams.notSetUp")
        : t("teams.teamsOff");
  return card([header(t("teams.kindNotSetUp"), input.markUrl), tb(text)], input.link ? [openUrl(t("teams.actionOpen"), input.link, true)] : []);
}

/** The Bot Framework attachment for a card. */
export function attachment(c: Card): { contentType: "application/vnd.microsoft.card.adaptive"; content: Card } {
  return { contentType: "application/vnd.microsoft.card.adaptive", content: c };
}

/** The size Teams limits: the UTF-8 bytes of the JSON. */
export function cardSize(c: Card): number {
  return new TextEncoder().encode(JSON.stringify(c)).length;
}

export type Submit = {
  kind: SubmitKind;
  caseId: string;
  cardId: string;
  answer?: "yes" | "no" | "ask";
  /** The reason of a no, or the question. */
  text?: string;
  /** A no's category: one the card offers. */
  category?: CardNoCategory;
  /** What would make it a yes. */
  changeIf?: string;
  /** The date the no comes back, as the card's date input sends it (YYYY-MM-DD): a real calendar date; the caller checks it against the company calendar. */
  revisitDay?: string;
  toSeatId?: string;
  why?: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function idOf(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= ID_MAX ? v : null;
}

/** An optional free text: absent or blank → undefined; not a string or too long → null (refuse). */
function optionalText(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length > max) return null;
  return s === "" ? undefined : s;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date input's value: absent or blank → undefined; anything but a real calendar date YYYY-MM-DD → null (refuse). */
function optionalDate(v: unknown): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return undefined;
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? s : null;
}

/** A no's category: absent or blank → undefined; one the card offers → it; anything else (also Already solved or in work, which the card cannot carry) → null (refuse). */
function optionalCategory(v: unknown): CardNoCategory | undefined | null {
  if (v === undefined || v === null || v === "") return undefined;
  return (CARD_NO_CATEGORIES as readonly unknown[]).includes(v) ? (v as CardNoCategory) : null;
}

/** The data a card sends back, checked; null when it is not one of ours. */
export function parseSubmit(value: unknown): Submit | null {
  if (!isRecord(value)) return null;
  const kind = (SUBMIT_KINDS as readonly unknown[]).includes(value.kind) ? (value.kind as SubmitKind) : null;
  const caseId = idOf(value.caseId);
  const cardId = idOf(value.cardId);
  if (!kind || !caseId || !cardId) return null;
  if (kind === "answer") {
    const answer = value.answer;
    if (answer !== "yes" && answer !== "no" && answer !== "ask") return null;
    const text = optionalText(value.text, ANSWER_TEXT_MAX);
    const category = optionalCategory(value.category);
    const changeIf = optionalText(value.changeIf, CHANGE_IF_MAX);
    const revisitDay = optionalDate(value.revisitDay);
    if (text === null || category === null || changeIf === null || revisitDay === null) return null;
    // The fields of a no mean nothing on a yes or a question: they are not carried along.
    const no = answer === "no";
    return {
      kind, caseId, cardId, answer, ...(text !== undefined ? { text } : {}),
      ...(no && category !== undefined ? { category } : {}),
      ...(no && changeIf !== undefined ? { changeIf } : {}),
      ...(no && revisitDay !== undefined ? { revisitDay } : {}),
    };
  }
  const toSeatId = idOf(value.toSeatId);
  const why = optionalText(value.why, WHY_MAX);
  if (!toSeatId || why === null) return null;
  return { kind, caseId, cardId, toSeatId, ...(why !== undefined ? { why } : {}) };
}
