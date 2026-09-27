// Accept invite: token -> set password -> joins the company with the role on the invite. Stub until Phase 2.
import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export const metadata = { title: "You have been invited" };
export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell side={<h2>Someone wants you in the loop.</h2>}>
      <AuthTitle title="You have been invited" sub={`Invite ${token} - accepting invites arrives in Phase 2.`} />
    </AuthShell>
  );
}
