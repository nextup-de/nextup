// Members: everyone in the company, their role, how they sign in. Add a person, change a role,
// hand out a new login code. Manager only - loadMembers() re-checks the role in the database.
import { loadMembers } from "@/server/actions/members";
import { MembersView } from "@/components/settings/MembersView";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settings.navMembers") };
}

export default async function MembersSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const page = await loadMembers(company);
  return (
    <>
      <h1>{t("settings.navMembers")}</h1>
      {page.status === "ok" ? (
        <MembersView slug={company} me={page.me} members={page.members} freeSeats={page.freeSeats} />
      ) : page.status === "no-database" ? (
        <p className="nh-hint">{t("settings.membersNoDatabase")}</p>
      ) : (
        <p className="nh-hint">{t("settings.membersManagerOnly")}</p>
      )}
    </>
  );
}
