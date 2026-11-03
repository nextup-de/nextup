// Members: everyone in the company, their role, how they sign in. Add a person, change a role,
// hand out a new login code. Manager only - loadMembers() re-checks the role in the database.
// Without a database it shows the sample people, read-only.
import { loadMembers } from "@/server/actions/members";
import { MembersView } from "@/components/settings/MembersView";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SAMPLE_MEMBER_ROWS } from "@/features/settings/demo";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settings.navMembers") };
}

export default async function MembersSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const page = await loadMembers(company);
  if (page.status === "ok") return <MembersView slug={company} me={page.me} members={page.members} freeSeats={page.freeSeats} />;
  if (page.status === "no-database") {
    return <MembersView slug={company} me="demo-hs" members={SAMPLE_MEMBER_ROWS} freeSeats={[{ id: "h-4", label: "Maintenance lead" }]} demo />;
  }
  return (
    <>
      <SettingsHead title={t("settings.membersTitle")} />
      <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
    </>
  );
}
