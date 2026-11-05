// /setup sends the visitor to the first step not done, and says so if they are coming back.
import { redirect } from "next/navigation";
import { currentSetupStep, setupHref } from "@/server/setup-page";

export default async function SetupIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const step = await currentSetupStep(company);
  redirect(setupHref(company, step) + (step === "company" || step === "done" ? "" : "?resume=1"));
}
