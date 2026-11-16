import type { EventPayload } from "@/features/cases/events";
import { LIMITS, PAGE_ICON_KEYS, TOOL_KINDS } from "./pages";
import type { PageIconKey, ToolKind } from "./types";

export type Preselect = { kind: ToolKind; toolId?: string };
export type WizardState = { step: 1 | 2; picks: Preselect[]; preselected?: Preselect; name: string; icon: PageIconKey; iconChosen: boolean };
export type WizardAction =
  | { type: "pick"; kind: ToolKind }
  | { type: "unpick" | "drop"; kind: ToolKind }
  | { type: "reorder"; from: number; to: number }
  | { type: "next" | "back" | "clear" }
  | { type: "name"; name: string }
  | { type: "icon"; icon: PageIconKey };

export const toolIcon: Record<ToolKind, PageIconKey> = {
  idea: "star", overview: "home", board: "board", list: "list", calendar: "calendar", timeline: "timeline", milestones: "flag",
  results: "target", files: "folder", doc: "doc", checklist: "checklist", table: "table", links: "link",
  requests: "inbox", team: "people", activity: "pulse", agent: "chat", archive: "box",
};
export function preselect(pick?: Preselect): WizardState {
  return { step: 1, picks: pick ? [{ ...pick }] : [], ...(pick ? { preselected: { ...pick } } : {}), name: "", icon: pick ? toolIcon[pick.kind] : "doc", iconChosen: false };
}
export const canNext = (state: WizardState): boolean => state.picks.length > 0;
export const canCreate = (state: WizardState): boolean => canNext(state) && state.name.trim().length >= LIMITS.titleMin && state.name.trim().length <= LIMITS.titleMax;

/** Pick positions are their numbers; the first tool supplies the icon until the person chooses one. */
export function wizard(state: WizardState, action: WizardAction): WizardState {
  let picks = state.picks;
  switch (action.type) {
    case "pick":
      if (!TOOL_KINDS.includes(action.kind) || picks.some((p) => p.kind === action.kind) || picks.length >= LIMITS.tools) return state;
      picks = [...picks, state.preselected?.kind === action.kind ? { ...state.preselected } : { kind: action.kind }]; break;
    case "unpick": case "drop": picks = picks.filter((p) => p.kind !== action.kind); break;
    case "clear": picks = []; break;
    case "reorder": {
      if (!Number.isInteger(action.from) || !Number.isInteger(action.to) || action.from < 0 || action.to < 0 || action.from >= picks.length || action.to >= picks.length) return state;
      picks = [...picks]; const [pick] = picks.splice(action.from, 1); picks.splice(action.to, 0, pick); break;
    }
    case "next": return canNext(state) ? { ...state, step: 2 } : state;
    case "back": return { ...state, step: 1 };
    case "name": return { ...state, name: action.name };
    case "icon": return PAGE_ICON_KEYS.includes(action.icon) ? { ...state, icon: action.icon, iconChosen: true } : state;
  }
  return { ...state, picks, icon: state.iconChosen ? state.icon : picks.length ? toolIcon[picks[0].kind] : "doc" };
}

/** Existing tools retain their identity and are moved only after this page has been persisted. */
export function toPageAdded(state: WizardState, ids: { pageId: string; toolIds: string[] }): EventPayload {
  if (!canCreate(state)) throw new Error("Invalid page wizard");
  const tools = state.picks.filter((pick) => !pick.toolId);
  if (tools.length !== ids.toolIds.length) throw new Error("Each new tool needs an id");
  return { pageId: ids.pageId, title: state.name.trim(), icon: state.icon, tools: tools.map((pick, i) => ({ kind: pick.kind, toolId: ids.toolIds[i] })) };
}
