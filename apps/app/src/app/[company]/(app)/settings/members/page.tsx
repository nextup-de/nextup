// Members: everyone in the company, their role, how they sign in. Add a person, change a role,
// hand out a new login code. Manager only - loadMembers() re-checks the role in the database.
import { loadMembers } from "@/server/actions/members";
import { MembersView } from "@/components/settings/MembersView";

export const metadata = { title: "Members" };

export default async function MembersSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const page = await loadMembers(company);
  return (
    <>
      <h1>Members</h1>
      {page.status === "ok" ? (
        <MembersView slug={company} me={page.me} members={page.members} />
      ) : page.status === "no-database" ? (
        <p className="nh-hint">People are stored in the database. This copy of NextUp runs without one, so there is nobody to manage here.</p>
      ) : (
        <p className="nh-hint">Only a manager of this company can see its members.</p>
      )}
    </>
  );
}
