// STEP 1 of login: work email or company name -> that company's /[company]/login (findCompany).
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell, AuthTitle, AuthFoot, AuthRoles } from "@/components/auth/AuthShell";
import { FindCompanyForm } from "@/components/auth/FindCompanyForm";

export async function generateMetadata() {
  return { title: (await getT())("auth.metaLogIn") };
}

export default async function FindCompanyPage() {
  const t = await getT();
  return (
    <AuthShell
      art="hand"
      side={
        <>
          <h2>{t("auth.findSideTitle1")}<br />{t("auth.findSideTitle2")}</h2>
          <p>{t("auth.findSideText")}</p>
          <AuthRoles items={[
            [t("auth.roleMember"), t("auth.roleMemberScreen"), t("auth.roleMemberLine")],
            [t("auth.roleLeader"), t("auth.roleLeaderScreen"), t("auth.roleLeaderLine")],
            [t("auth.roleManager"), t("auth.roleManagerScreen"), t("auth.roleManagerLine")],
          ]} />
        </>
      }
    >
      <AuthTitle title={t("auth.findTitle")} sub={t("auth.findSub")} />

      <FindCompanyForm />

      <AuthFoot>
        {t("auth.newHere")} <Link href="/signup">{t("auth.createWorkspace")}</Link> · <Link href="/invite/demo">{t("auth.haveInvite")}</Link>
      </AuthFoot>
    </AuthShell>
  );
}
