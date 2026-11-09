// What the visitor did in the preview at /demo/preview, and what follows from it. Pure: the pages keep one
// PreviewState in the browser's memory (components/demo/preview/PreviewProvider.tsx) and change it only
// through reducePreview. Nothing is stored, so a reload starts over.
//
// The path: the agent plans the idea (optional) -> yes with a template -> setup -> start -> the preview
// jumps to PREVIEW_DAY, where the agent has three suggestions -> each is accepted or dismissed by a person.
import { templateOf, type TemplateKey, type TemplateStep } from "./templates";

/** The setup checklist of docs/plans/2026-11-03_project-setup.md: three items are needed before the start. */
export const SETUP_ITEMS = [
  { key: "team", required: true },
  { key: "roles", required: false },
  { key: "goal", required: true },
  { key: "baseline", required: true },
  { key: "tools", required: false },
  { key: "context", required: false },
  { key: "rhythm", required: false },
] as const;
export type SetupKey = (typeof SETUP_ITEMS)[number]["key"];
export type SetupMark = "done" | "na";

export type Column = "todo" | "doing" | "done";
export type PreviewStep = TemplateStep & { id: string; column: Column; fromAgent: boolean };

export type SuggestionKind = "unblock" | "report" | "plan";
/** `role`: who an accepted nudge goes to. `step`: what an accepted plan adds to the board. */
export type Suggestion = { kind: SuggestionKind; title: string; why: string; draft: string; role?: string; step?: TemplateStep };
export type Answer = "accepted" | "dismissed";

export type PreviewState = {
  planned: boolean;
  decided: { templateKey: TemplateKey | null; withDraft: boolean } | null;
  setup: Partial<Record<SetupKey, SetupMark>>;
  started: boolean;
  steps: readonly PreviewStep[];
  /** Written at the start and kept, so an accepted suggestion keeps the words it was accepted with. */
  suggestions: readonly Suggestion[];
  answers: Partial<Record<SuggestionKind, Answer>>;
};

export type PreviewAction =
  | { type: "plan" }
  | { type: "decide"; templateKey: TemplateKey | null; withDraft: boolean }
  | { type: "setup"; key: SetupKey; mark: SetupMark | null }
  | { type: "start" }
  | { type: "move"; stepId: string }
  | { type: "answer"; kind: SuggestionKind; answer: Answer }
  | { type: "reset" };

export const PREVIEW_START: PreviewState = { planned: false, decided: null, setup: {}, started: false, steps: [], suggestions: [], answers: {} };

/** The project page's tabs, picked by ?tab=; anything unknown is the Overview. */
export const PREVIEW_TABS = ["overview", "board", "agent"] as const;
export type PreviewTab = (typeof PREVIEW_TABS)[number];
export const previewTabOf = (raw: string | string[] | undefined): PreviewTab => PREVIEW_TABS.find((k) => k === (Array.isArray(raw) ? raw[0] : raw)) ?? "overview";

/** The day of the project the preview shows after the start. */
export const PREVIEW_DAY = 5;

/** The needed setup items that are still open. */
export const missingSetup = (s: PreviewState): SetupKey[] => SETUP_ITEMS.filter((i) => i.required && s.setup[i.key] !== "done").map((i) => i.key);
export const canStart = (s: PreviewState): boolean => s.decided !== null && !s.started && missingSetup(s).length === 0;
export const openSuggestions = (s: PreviewState): Suggestion[] => s.suggestions.filter((x) => !s.answers[x.kind]);

/** The board on PREVIEW_DAY: what was due before it is done, the next step is being worked on. */
function atPreviewDay(steps: readonly PreviewStep[]): PreviewStep[] {
  const next = steps.findIndex((x) => x.dueDay >= PREVIEW_DAY);
  return steps.map((x, k) => (x.dueDay < PREVIEW_DAY ? { ...x, column: "done" } : k === next ? { ...x, column: "doing" } : x));
}

const FIRST_STEPS: { step: TemplateStep; why: string } = {
  step: { title: "Agree the first three steps with the team", role: "Lead", dueDay: 7 },
  why: "The project started without a template and has no steps yet.",
};

/** What the agent would suggest for this board: a nudge for the open step, the weekly update, a missing step. */
export function suggestionsAt(steps: readonly PreviewStep[], templateKey: TemplateKey | null): Suggestion[] {
  const doing = steps.find((x) => x.column === "doing");
  const done = steps.filter((x) => x.column === "done").length;
  const dueIn = doing ? doing.dueDay - PREVIEW_DAY : 0;
  const learned = templateKey ? templateOf(templateKey).learned : FIRST_STEPS;
  const out: Suggestion[] = [];
  if (doing) {
    out.push({
      kind: "unblock",
      title: `"${doing.title}" waits on the ${doing.role}`,
      why: `It is due in ${dueIn} days and nobody has taken it yet.`,
      draft: `"${doing.title}" is due in ${dueIn} days and has no owner yet. Can you take it, or say what is in the way?`,
      role: doing.role,
    });
  }
  out.push({
    kind: "report",
    title: "This week's update for the sponsor and the raiser",
    why: "The raiser has not heard from the project since it started.",
    draft: doing
      ? `Day ${PREVIEW_DAY}: ${done} of ${steps.length} steps are done and nothing is late. Open now: "${doing.title}" (${doing.role}), due in ${dueIn} days.`
      : `Day ${PREVIEW_DAY}: the project has started. The team is agreeing its first steps.`,
  });
  out.push({
    kind: "plan",
    title: `Add a step: ${learned.step.title}`,
    why: learned.why,
    draft: `${learned.step.title} · ${learned.step.role} · due on day ${learned.step.dueDay}`,
    step: learned.step,
  });
  return out;
}

/** The ask box: two questions the agent answers from the board, never from anything else. */
export function questionsAt(steps: readonly PreviewStep[]): { q: string; a: string }[] {
  const doing = steps.filter((x) => x.column === "doing");
  const left = steps.filter((x) => x.column !== "done");
  const last = Math.max(0, ...steps.map((x) => x.dueDay));
  return [
    {
      q: "What is open right now?",
      a: doing.length ? doing.map((x) => `"${x.title}" (${x.role}, due on day ${x.dueDay})`).join("; ") + "." : "Nothing is being worked on right now.",
    },
    {
      q: "Are we on time?",
      a: left.length ? `${steps.length - left.length} of ${steps.length} steps are done and nothing is late. The last step is due on day ${last}.` : "Every step is done.",
    },
  ];
}

export function reducePreview(s: PreviewState, a: PreviewAction): PreviewState {
  switch (a.type) {
    case "reset":
      return PREVIEW_START;
    case "plan":
      return s.decided ? s : { ...s, planned: true };
    case "decide": {
      if (s.decided) return s;
      const steps = a.templateKey ? templateOf(a.templateKey).steps : [];
      return {
        ...s,
        // There is no draft to use when the agent was never asked.
        decided: { templateKey: a.templateKey, withDraft: a.withDraft && s.planned },
        steps: steps.map((x, k) => ({ ...x, id: "s" + (k + 1), column: "todo", fromAgent: false })),
      };
    }
    case "setup": {
      if (!s.decided || s.started) return s;
      // A needed item can be done or open, never "not needed".
      if (a.mark === "na" && SETUP_ITEMS.some((i) => i.key === a.key && i.required)) return s;
      const setup = { ...s.setup };
      if (a.mark === null) delete setup[a.key];
      else setup[a.key] = a.mark;
      return { ...s, setup };
    }
    case "start": {
      if (!canStart(s)) return s;
      const steps = atPreviewDay(s.steps);
      return { ...s, started: true, steps, suggestions: suggestionsAt(steps, s.decided?.templateKey ?? null) };
    }
    case "move":
      if (!s.started) return s;
      return { ...s, steps: s.steps.map((x) => (x.id === a.stepId && x.column !== "done" ? { ...x, column: x.column === "todo" ? "doing" : "done" } : x)) };
    case "answer": {
      const sug = s.suggestions.find((x) => x.kind === a.kind);
      // One answer per suggestion, and it stays.
      if (!sug || s.answers[a.kind]) return s;
      const added: PreviewStep[] = a.answer === "accepted" && sug.step ? [{ ...sug.step, id: "a" + (s.steps.length + 1), column: "todo", fromAgent: true }] : [];
      return { ...s, answers: { ...s.answers, [a.kind]: a.answer }, steps: [...s.steps, ...added] };
    }
  }
}
