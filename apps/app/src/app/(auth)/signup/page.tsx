// Creates a company + its first manager. Stub until Phase 2.
import { getT } from "@/i18n/server";
import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export async function generateMetadata() {
  return { title: (await getT())("auth.metaSignup") };
}
export default async function SignupPage() {
  const t = await getT();
  return (
    <AuthShell side={<h2>{t("auth.signupSide")}</h2>}>
      <AuthTitle title={t("auth.signupTitle")} sub={t("auth.signupSub")} />
    </AuthShell>
  );
}
