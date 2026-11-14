"use client";
// The answer page where there is no database (the local demo): the form comes from the demo's own log, an answer goes through the demo acts, and
// the requests shown are the current person's own. The server path (page.tsx, server/forms.ts) is untouched.
import { notFound } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { AnswerForm, MyRequest } from "@/server/forms";
import { useRights } from "../../parts";
import { AnswerPage, type AnswerSender } from "./AnswerPage";

export function DemoAnswer({ formId }: { formId: string }) {
  const { S } = useDemo();
  const project = S.projects.find((p) => p.forms.some((form) => form.id === formId));
  const form = project?.forms.find((f) => f.id === formId);
  if (!project || !form || !form.shared || project.status === "stopped" || project.status === "recognised") notFound();
  return <Inner formId={formId} />;
}

function Inner({ formId }: { formId: string }) {
  const { S, act, actorUserId } = useDemo();
  const project = S.projects.find((p) => p.forms.some((f) => f.id === formId));
  const form = project?.forms.find((f) => f.id === formId);
  const rights = useRights(project as NonNullable<typeof project>);
  if (!project || !form) return null;
  const data: AnswerForm = { projectTitle: project.title, form: { title: form.title, intro: form.intro, fields: form.fields, rev: form.rev } };
  const mine: MyRequest[] = project.requests
    .filter((r) => r.formId === formId && r.byUserId === (actorUserId ?? null))
    .map((r) => ({ id: r.id, day: r.day, state: r.state, reason: r.state === "declined" ? r.why : null }))
    .reverse();
  const send: AnswerSender = async (rev, answers) => {
    const current = S.projects.find((p) => p.id === project.id)?.forms.find((f) => f.id === formId);
    const verdict = rights.check("project.form.answered", { formId, formRev: rev, requestId: "probe", answers });
    if (!verdict.ok) {
      const fresh = current && current.rev !== rev ? { projectTitle: project.title, form: { title: current.title, intro: current.intro, fields: current.fields, rev: current.rev } } : undefined;
      return { ok: false, error: verdict.error, ...(fresh ? { changed: fresh } : {}) };
    }
    act.project.form.answer(project.id, formId, rev, answers);
    return { ok: true };
  };
  return <AnswerPage formId={formId} initial={data} requests={mine} send={send} />;
}
