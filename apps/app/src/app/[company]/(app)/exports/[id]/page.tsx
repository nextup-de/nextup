// The page a person opens from "your export is ready": what the file is, its size, until when, and the download.
// Only the subject of a copy made for them sees it; everyone else gets a 404.
import { notFound } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { getViewerFor } from "@/features/auth/session";
import { formatSize } from "@/features/privacy/export";
import { formatDate } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getExport, isExpired } from "@/lib/db/privacy-export";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT())("privacyExport.pageTitle") };
}

export default async function ExportPage({ params }: { params: Promise<{ company: string; id: string }> }) {
  const { company, id } = await params;
  const viewer = await getViewerFor(company);
  if (!viewer) notFound();
  const row = await getExport(viewer.companyId, id);
  if (!row || row.kind !== "person" || row.deliverTo !== "person" || row.subjectUserId !== viewer.userId) notFound();

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const expired = isExpired(row);
  if (!expired && row.status !== "ready") notFound(); // preparing or failed: nothing to show

  return (
    <main className={s.page}>
      <PageHeader title={t("privacyExport.pageTitle")} />
      <SectionCard name="export">
        {expired ? (
          <p className={s.text} data-testid="export-expired">{t("privacyExport.expired")}</p>
        ) : (
          <>
            <p className={s.text}>{t("privacyExport.pageIntro")}</p>
            <p className={s.hint}>{t("privacyExport.pageSize", { size: formatSize(row.sizeBytes ?? 0, locale) })}</p>
            <p className={s.hint}>{t("privacyExport.pageExpires", { date: formatDate(locale, row.expiresAt, "full") })}</p>
            <a className={s.download} data-testid="export-download" href={`/api/${company}/exports/${id}`} download>
              {t("privacyExport.download")}
            </a>
          </>
        )}
      </SectionCard>
    </main>
  );
}
