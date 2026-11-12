"use client";
// The cases around a case, as the viewer may read them (plan SEE, D16, D17): the title and the link of another case or project only when
// the viewer may open it; otherwise nothing, and the caller words it generically ("a case"). A hidden case's title is never leaked.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen } from "@/components/dashboard/derive";
import { isPrivateIdea } from "@/features/cases/visibility";
import { isOpenDraft, mayReadDraft } from "@/features/projects/views";

export type Related = { title: string | null; to: string | null };

export function useRelatedCase() {
  const ctx = useDemo();
  const { S, href, role, actorUserId } = ctx;
  const openable = (id: string) => {
    const c = S.cases.find((x) => x.id === id);
    return c !== undefined && canOpen(ctx, c);
  };
  /** A case of the company: its title and page when the viewer may open it. */
  const ofCase = (id: string): Related => {
    const c = S.cases.find((x) => x.id === id);
    return c && canOpen(ctx, c) ? { title: c.title, to: href("/cases/" + encodeURIComponent(c.id)) } : { title: null, to: null };
  };
  /** A case or a project (a duplicate may be either): a draft the viewer may not read counts as hidden. */
  const ofCaseOrProject = (id: string): Related => {
    const found = ofCase(id);
    if (found.title !== null) return found;
    const p = S.projects.find((x) => x.id === id);
    if (!p) return found;
    const hidden = isOpenDraft(p) && !mayReadDraft(p, { role, userId: actorUserId }, S.cases.some((x) => p.sources.includes(x.id) && isPrivateIdea(x)));
    return hidden ? found : { title: p.title, to: href("/projects/" + encodeURIComponent(p.id)) };
  };
  return { openable, ofCase, ofCaseOrProject };
}
