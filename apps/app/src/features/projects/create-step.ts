import { STEP_COLUMNS, type StepColumn } from "./types";

export type CreateStepInput = {
  title: string;
  column?: StepColumn;
  owner?: string | null;
  ownerUserId?: string | null;
  dueDay?: number | null;
  note?: string;
};

export type CreateStepPreset = Partial<Pick<CreateStepInput, "title" | "column" | "dueDay" | "note">>;
export type StepAddedPayload = {
  stepId: string;
  text: string;
  owner?: string;
  ownerUserId?: string;
  dueDay?: number;
  to?: StepColumn;
  note?: string;
};

/** The event payload for one step, with identity supplied by the caller. */
export function toStepAdded(
  input: CreateStepInput,
  preset: CreateStepPreset | undefined,
  ids: (prefix: "s") => string,
): StepAddedPayload {
  const title = input.title.trim() || preset?.title?.trim() || "";
  const column = input.column ?? preset?.column ?? "todo";
  const dueDay = input.dueDay !== undefined ? input.dueDay : (preset?.dueDay ?? null);
  const note = (input.note ?? preset?.note ?? "").trim();
  return {
    stepId: ids("s"),
    text: title,
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    ...(dueDay !== null ? { dueDay } : {}),
    ...(column !== "todo" ? { to: column } : {}),
    ...(note ? { note } : {}),
  };
}

/** The title is required; optional fields stay within the event contract. */
export function validStep(input: CreateStepInput): boolean {
  const column = input.column ?? "todo";
  return input.title.trim().length > 0
    && input.title.trim().length <= 500
    && (input.note ?? "").trim().length <= 2000
    && STEP_COLUMNS.includes(column)
    && (input.dueDay === undefined || input.dueDay === null || Number.isFinite(input.dueDay));
}
