// Name, slug, logo, departments.
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settings.navCompany") };
}

export default async function CompanySettingsPage() {
  const t = await getT();
  return (
    <>
      <h1>{t("settings.navCompany")}</h1>
      <p className="nh-hint">{t("settings.companyHint")}</p>
    </>
  );
}
