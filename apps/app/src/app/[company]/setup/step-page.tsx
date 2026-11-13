// What every setup page does: load its step and show it. Each step has its own address, and each page
// is one line on top of this.
import { SetupDone } from "@/components/setup/SetupDone";
import { SetupStepView } from "@/components/setup/SetupStepView";
import type { SetupStep } from "@/features/settings/sections";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { SETUP_FORM_STEPS } from "@/server/actions/settings/setup";
import { loadSetupPage } from "@/server/setup-page";

export type SetupPageProps = { params: Promise<{ company: string }>; searchParams: Promise<{ resume?: string | string[] }> };

export async function setupMetadata() {
  return { title: (await getT())("settingsSetup.navLabel") };
}

export async function SetupStepPage({ params, searchParams, step }: SetupPageProps & { step: SetupStep }) {
  const { company } = await params;
  const { resume } = await searchParams;
  const { data, demo, ready, facts, opened } = await loadSetupPage(company, step);
  const prefix = companyPrefix(company);
  if (step === "done") return <SetupDone prefix={prefix} backHref={`${prefix}/setup/${SETUP_FORM_STEPS[SETUP_FORM_STEPS.length - 1]}`} data={data} facts={facts} opened={opened} />;
  return (
    <SetupStepView base={`${prefix}/setup`} slug={company} steps={SETUP_FORM_STEPS} step={step} data={data} ready={ready} resume={resume !== undefined} demo={demo} />
  );
}
