// Edits to an open idea's Affects and Context (the Overview's idea page). The title and the text are
// real: they go out as the next version (case.revised). Affects and Context have no event yet, so the
// page keeps them as a stand-in (components/dashboard/team/ideaEditsPreview.ts) and lays them over the
// brief with applyIdeaEdits. Pure: brief and edits in, brief out.
import type { AffectedDept, IdeaBrief } from "./brief";

/** What a person changed, section by section; a missing key leaves the section as the brief has it. */
export type IdeaEdits = {
  /** The teams and people it affects, by name, in order. */
  affects?: string[];
  context?: string;
  /** The facts under Context, by label. */
  prompts?: Record<string, string>;
};

/** What one save changes: the title and text (a new version) and the stand-in sections. */
export type IdeaChanges = IdeaEdits & { title?: string; body?: string };

/** The brief with the edits laid over it. A name that was a person stays a person; anything new is a team. */
export function applyIdeaEdits(brief: IdeaBrief, e: IdeaEdits | null | undefined): IdeaBrief {
  if (!e) return brief;
  let out = brief;
  if (e.affects) {
    const names = e.affects.map((n) => n.trim()).filter(Boolean);
    const person = new Map(brief.people.map((x) => [x.name, x]));
    const dept = new Map(brief.depts.map((d) => [d.name, d]));
    out = {
      ...out,
      people: names.filter((n) => person.has(n)).map((n) => person.get(n)!),
      depts: names.filter((n) => !person.has(n)).map((n): AffectedDept => dept.get(n) ?? { id: "edit:" + n, name: n, ai: false, why: null, members: [] }),
    };
  }
  if (e.context !== undefined) out = { ...out, context: e.context.trim() || null };
  if (e.prompts) {
    const prompts = e.prompts;
    out = { ...out, prompts: out.prompts.map((pr) => (pr.label in prompts ? { ...pr, text: prompts[pr.label] } : pr)) };
  }
  return out;
}

/** Only what really changed against the brief and the case, so an untouched section stays as it was. */
export function changesOf(brief: IdeaBrief, title: string, draft: IdeaChanges): IdeaChanges {
  const out: IdeaChanges = {};
  if (draft.title !== undefined && draft.title.trim() && draft.title.trim() !== title.trim()) out.title = draft.title.trim();
  if (draft.body !== undefined && draft.body.trim() && draft.body.trim() !== brief.description.trim()) out.body = draft.body.trim();
  const affectsNow = [...brief.depts.map((d) => d.name), ...brief.people.map((x) => x.name)];
  if (draft.affects && draft.affects.join("\n") !== affectsNow.join("\n")) out.affects = draft.affects;
  if (draft.context !== undefined && draft.context.trim() !== (brief.context ?? "").trim()) out.context = draft.context;
  if (draft.prompts && brief.prompts.some((pr) => (draft.prompts![pr.label] ?? pr.text) !== pr.text)) out.prompts = draft.prompts;
  return out;
}
