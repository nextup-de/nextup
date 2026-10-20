// Knowledge moved to Data, /admin/company-data (docs/plans/2026-10-21_company-data-page.md). The old address still works,
// with the company it was asked for.
import { redirect } from "next/navigation";
import { adminBase } from "@/features/admin/nav";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  redirect(`${adminBase()}/company-data${company ? `?company=${encodeURIComponent(company)}` : ""}`);
}
