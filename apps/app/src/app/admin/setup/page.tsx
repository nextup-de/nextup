// Console: the same setup overview, read-only, so NextUp support can follow along (a support session
// gets this page through the same door as a stack admin). The company comes from consoleCompany().
import { notFound } from "next/navigation";
import { SetupOverview } from "@/components/setup/SetupOverview";
import { consoleCompany } from "@/server/console-guard";
import { loadConsoleSetupOverview } from "@/server/setup-overview";

export default async function ConsoleSetupPage() {
  const guard = await consoleCompany();
  if (!guard) notFound();
  const { phases, poll } = await loadConsoleSetupOverview(guard);
  return <SetupOverview phases={phases} poll={poll} ledeKey="settingsSetupPhases.consoleLede" />;
}
