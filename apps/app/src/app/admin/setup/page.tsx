// Console: the same setup overview, read-only, so NextUp support can follow along (a support session
// gets this page through the same door as a stack admin). The company comes from consoleCompany().
// Below it the hand-over (Q8.6): the customer's IT confirms it once the server phase is checked.
import { notFound } from "next/navigation";
import { HandOverCard } from "@/components/setup/HandOverCard";
import { SetupOverview } from "@/components/setup/SetupOverview";
import { handOverState } from "@/features/settings/hand-over";
import { consoleCompany } from "@/server/console-guard";
import { loadConsoleSetupOverview } from "@/server/setup-overview";

export default async function ConsoleSetupPage() {
  const guard = await consoleCompany();
  if (!guard) notFound();
  const { phases, poll, handedOver } = await loadConsoleSetupOverview(guard);
  const server = phases?.find((p) => p.key === "server")?.status ?? null;
  const handOver = handOverState({ handedOver, server, via: guard.via });
  return <SetupOverview phases={phases} poll={poll} ledeKey="settingsSetupPhases.consoleLede" after={<HandOverCard state={handOver} />} />;
}
