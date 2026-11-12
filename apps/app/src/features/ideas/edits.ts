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

// ── The idea page in the projects frame (Paper "Idea · editing", P1-P3): one content model with the raise card ──

export type Line = { label: string; text: string };
export type IdeaFileRef = { name: string; ext: string; meta: string };

/** What the author wrote and what the system knows, apart: the author's lines stay in Context, the system's go to Who. */
export type IdeaContent = {
  title: string; description: string; affects: string[]; context: string; lines: Line[]; files: IdeaFileRef[];
  /** The system's: what the routing map says it is worth and how it was routed (read only). */
  worth: string | null; routedAs: string | null;
};

/** The labels the brief uses for lines the system made, not the author (brief.ts): worth, routed as, and the rest that Who and the meta line already say. */
export type SystemLabels = { worth: string; routedAs: string; drop: readonly string[] };

/** Split a brief into what the page shows. */
export function ideaContent(brief: IdeaBrief, title: string, files: readonly IdeaFileRef[], sys: SystemLabels): IdeaContent {
  const system = new Set([sys.worth, sys.routedAs, ...sys.drop]);
  return {
    title, description: brief.description, context: brief.context ?? "",
    affects: [...brief.depts.map((d) => d.name), ...brief.people.map((x) => x.name)],
    lines: brief.prompts.filter((p) => !system.has(p.label)).map((p) => ({ label: p.label, text: p.text })),
    files: [...files],
    worth: brief.prompts.find((p) => p.label === sys.worth)?.text ?? null,
    routedAs: brief.prompts.find((p) => p.label === sys.routedAs)?.text ?? null,
  };
}

/** The page's stand-in edits (Affects, Context, its lines, the files): laid over the content as saved. */
export type PageEdits = { affects?: string[]; context?: string; lines?: Line[]; files?: IdeaFileRef[] };

export function applyPageEdits(c: IdeaContent, e: PageEdits | null | undefined): IdeaContent {
  if (!e) return c;
  return {
    ...c,
    ...(e.affects ? { affects: e.affects } : {}),
    ...(e.context !== undefined ? { context: e.context } : {}),
    ...(e.lines ? { lines: e.lines } : {}),
    ...(e.files ? { files: e.files } : {}),
  };
}

/** One save: the title and text (the next version, real) and the stand-in parts - only what changed. */
export type PageChanges = PageEdits & { title?: string; description?: string };

export function pageChanges(now: IdeaContent, draft: Partial<IdeaContent>): PageChanges {
  const out: PageChanges = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (draft.title !== undefined && draft.title.trim() && draft.title.trim() !== now.title.trim()) out.title = draft.title.trim();
  if (draft.description !== undefined && draft.description.trim() && draft.description.trim() !== now.description.trim()) out.description = draft.description.trim();
  if (draft.affects && !same(draft.affects, now.affects)) out.affects = draft.affects;
  if (draft.context !== undefined && draft.context.trim() !== now.context.trim()) out.context = draft.context.trim();
  if (draft.lines) {
    const lines = draft.lines.map((l) => ({ label: l.label.trim(), text: l.text.trim() })).filter((l) => l.label && l.text);
    if (!same(lines, now.lines)) out.lines = lines;
  }
  if (draft.files && !same(draft.files, now.files)) out.files = draft.files;
  return out;
}
