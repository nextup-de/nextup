// A shared form on its own page (plan REQ, D3): any signed-in person of the company who opens the link may answer it. They see the form, whom it
// asks and, afterwards, what became of their own requests - nothing else of the project. A `[company]` that is not the session's company is not found.
import { notFound } from "next/navigation";
import { getViewerFor } from "@/features/auth/session";
import { DemoAnswer } from "@/components/projects/requests/answer/DemoAnswer";
import { hasDatabase } from "@/lib/db/client";
import { AnswerPage } from "@/components/projects/requests/answer/AnswerPage";
import { formForAnswer, myRequests } from "@/server/forms";

export default async function FormAnswerPage({ params }: { params: Promise<{ company: string; formId: string }> }) {
  const { company, formId } = await params;
  // No database (the local demo): the page reads the demo's own log in the browser.
  if (!hasDatabase()) return <DemoAnswer formId={formId} />;
  if (!(await getViewerFor(company))) notFound();
  const [data, requests] = await Promise.all([formForAnswer(formId), myRequests(formId)]);
  if (!data) notFound();
  return <AnswerPage formId={formId} initial={data} requests={requests} />;
}
