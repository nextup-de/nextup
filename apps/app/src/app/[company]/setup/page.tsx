// /setup is the overview: every phase, who owns it and how far it is. The way back into the five steps
// is phase 5's link, which leads to the first step not done.
import { SetupOverview } from "@/components/setup/SetupOverview";
import { loadSetupOverview } from "@/server/setup-overview";
import { setupMetadata } from "./step-page";

export const generateMetadata = setupMetadata;

export default async function SetupIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const { phases, poll } = await loadSetupOverview(company);
  return <SetupOverview phases={phases} poll={poll} ledeKey="settingsSetupPhases.lede" slug={company} />;
}
