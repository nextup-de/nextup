import { getT } from "@/i18n/server";
import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export async function generateMetadata() {
  return { title: (await getT())("auth.metaResetPassword") };
}
export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <AuthShell side={<h2>{t("auth.forgotSide")}</h2>}>
      <AuthTitle title={t("auth.forgotTitle")} sub={t("auth.forgotSub")} />
    </AuthShell>
  );
}
