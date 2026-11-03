// Shared shop-floor devices and floor codes. Company admins only (companyAdminOf).
import { notFound } from "next/navigation";
import { FloorDevices } from "@/components/settings/FloorDevices";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { listAreas, listDevices } from "@/lib/db/floor";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("floorDevices.title") };
}

export default async function FloorDevicesPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  const head = (
    <>
      <h1>{t("floorDevices.title")}</h1>
      <p className="nh-hint">{t("floorDevices.hint")}</p>
    </>
  );
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <>{head}<p>{t("floorDevices.noDatabase")}</p></>;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  const [devices, areas, users] = await Promise.all([
    listDevices(admin.companyId),
    listAreas(admin.companyId),
    getDb().user.findMany({ where: { companyId: admin.companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const nameOf = new Map(areas.map((a) => [a.id, a.name]));
  return (
    <>
      {head}
      <FloorDevices
        slug={company}
        areas={areas.map((a) => ({ id: a.id, name: a.name }))}
        members={users}
        devices={devices.map((d) => ({
          id: d.id,
          label: d.label,
          areaNames: d.areaIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n),
          pairedAt: d.pairedAt?.toISOString() ?? null,
          lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
