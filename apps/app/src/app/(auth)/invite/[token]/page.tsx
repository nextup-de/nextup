// Accept invite: token -> set password -> joins the company with the role on the invite. Stub until Phase 2.
import { getT } from "@/i18n/server";
import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export async function generateMetadata() {
  return { title: (await getT())("auth.metaInvited") };
}
export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  return (
    <AuthShell side={<h2>{t("auth.inviteSide")}</h2>}>
      <AuthTitle title={t("auth.inviteTitle")} sub={t("auth.inviteSub", { token })} />
    </AuthShell>
  );
}
