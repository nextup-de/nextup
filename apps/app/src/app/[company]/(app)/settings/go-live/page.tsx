// GoLive: stub (PIL-G1). Title and lead only; company admins only.
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("settingsGoLive.navLabel") };
}

export default async function GoLivePage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("settingsGoLive.title")}</h1>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("settingsGoLive.noDatabase")}</p></>;
  if (!(await companyAdminOf(company))) notFound();
  return head;
}
