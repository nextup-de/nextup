// What a signed-in person of the company may read of a shared form (plan REQ, D3): the form, the title of the project it asks, and the
// state of their own requests of it. Nothing else of the project. Who asks and which company it is come only from the signed-in session
// on the server, as server/actions/events.ts finds its viewer: no function here takes a user id or a company id from the caller.
import { getViewer, getViewerFor, type Viewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { isEnabled } from "@/features/flags";
import type { Form, FormField, ReducedProject, Request } from "@/features/projects/types";
import { getDb } from "@/lib/db/client";
import { loadLogAround } from "@/lib/db/events";

export type AnswerForm = { projectTitle: string; form: { title: string; intro: string; fields: FormField[]; rev: number } };
export type MyRequest = { id: string; day: number; state: Request["state"]; reason: string | null };

/** The signed-in viewer of the session's own company, still valid, and an active user of it. */
async function sessionViewer(): Promise<Viewer | null> {
  const first = await getViewer();
  const viewer = first ? await getViewerFor(first.companySlug) : null;
  if (!viewer) return null;
  const user = await getDb().user.findFirst({ where: { id: viewer.userId, companyId: viewer.companyId, active: true }, select: { id: true } });
  return user ? viewer : null;
}

type Found = { viewer: Viewer; project: ReducedProject; form: Form };

/** The form, in the session's company, with the project that owns it; null for anything else (no such form, another company's, the flag off). */
async function findForm(formId: string): Promise<Found | null> {
  if (typeof formId !== "string" || formId.length === 0 || formId.length > 64) return null;
  const viewer = await sessionViewer();
  if (!viewer || !(await isEnabled(viewer.companySlug, "projectPages"))) return null;
  const saved = await getDb().caseEvent.findFirst({
    where: { companyId: viewer.companyId, type: "project.form.saved", payload: { path: ["formId"], equals: formId } },
    select: { targetId: true },
  });
  if (!saved?.targetId) return null;
  const seed = await seedFor(viewer.companySlug);
  const state = reduce(seed, await loadLogAround(viewer.companyId, seed, [saved.targetId]));
  const project = state.projects.find((p) => p.id === saved.targetId);
  const form = project?.forms.find((f) => f.id === formId);
  return project && form ? { viewer, project, form } : null;
}

const live = (p: ReducedProject) => p.status !== "stopped" && p.status !== "recognised";

/** A shared form of a live project, for the person who opened its link: only its questions and whom they ask. Null otherwise. */
export async function formForAnswer(formId: string): Promise<AnswerForm | null> {
  const found = await findForm(formId);
  if (!found || !found.form.shared || !live(found.project)) return null;
  const { form, project } = found;
  return { projectTitle: project.title, form: { title: form.title, intro: form.intro, fields: form.fields, rev: form.rev } };
}

/** The signed-in person's own requests of that form, newest first, with their state and the reason a decline gave. Never anyone else's. */
export async function myRequests(formId: string): Promise<MyRequest[]> {
  const found = await findForm(formId);
  if (!found) return [];
  return found.project.requests
    .filter((r) => r.formId === formId && r.byUserId === found.viewer.userId)
    .map((r) => ({ id: r.id, day: r.day, state: r.state, reason: r.state === "declined" ? r.why : null }))
    .reverse();
}

/** Where an answer to this form is appended: the company slug and the project, found from the session; null when the form cannot be answered. */
export async function answerTarget(formId: string): Promise<{ slug: string; projectId: string; rev: number } | null> {
  const found = await findForm(formId);
  if (!found || !found.form.shared || !live(found.project)) return null;
  return { slug: found.viewer.companySlug, projectId: found.project.id, rev: found.form.rev };
}
