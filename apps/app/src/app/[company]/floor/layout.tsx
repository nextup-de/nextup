// The phone shell of the shop-floor pages (plan FLR, D6, D14): outside the (app) group, so no app shell
// and no session. The web app manifest is linked from here only.
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { FloorShell } from "@/components/floor/FloorShell";
import { findTenant } from "@/features/tenant";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/db/mode";
import { floorUserFromCookie } from "@/server/floor/raise";

export const metadata: Metadata = { manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function FloorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  let signedIn: string | null = null;
  if (hasDatabase()) {
    const row = await getDb().company.findUnique({ where: { slug: tenant.slug }, select: { id: true } });
    signedIn = row ? ((await floorUserFromCookie(row.id))?.name ?? null) : null;
  }
  return <FloorShell slug={tenant.slug} companyName={tenant.name} mark={tenant.mark} signedInName={signedIn}>{children}</FloorShell>;
}
