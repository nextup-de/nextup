// Raise from an area (plan FLR, D7): the page that the area's QR code opens.
import { notFound, redirect } from "next/navigation";
import { RaiseForm } from "@/components/floor/RaiseForm";
import styles from "@/components/floor/Floor.module.css";
import { pickSeat } from "@/features/floor/raise";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { seatAbove } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { findArea } from "@/lib/db/floor";
import { hasDatabase } from "@/lib/db/mode";
import { floorUserFromCookie } from "@/server/floor/raise";

export async function generateMetadata() {
  return { title: (await getT())("floor.title") };
}

export default async function FloorAreaPage({ params }: { params: Promise<{ company: string; area: string }> }) {
  const { company, area: areaKey } = await params;
  const t = await getT();
  const message = (key: "floor.unknownTitle" | "floor.pausedTitle") => <p className={styles.heading} data-testid="floor-raise-state">{t(key)}</p>;
  if (!hasDatabase()) return message("floor.unknownTitle");

  const db = getDb();
  const co = await db.company.findUnique({ where: { slug: company }, select: { id: true, openedAt: true } });
  if (!co) notFound();
  if (!co.openedAt) return message("floor.pausedTitle"); // closed until opened
  const area = await findArea(co.id, areaKey);
  if (!area) return message("floor.unknownTitle");
  if (!area.on) return message("floor.pausedTitle");

  const signedIn = await floorUserFromCookie(co.id);
  const base = `${companyPrefix(company)}/floor/${area.key}`;
  if (!area.anonymous && !signedIn) redirect(`${base}/sign-in`);

  const holders = await db.orgRoleHolder.findMany({
    where: { companyId: co.id, roleId: area.roleId },
    select: { id: true, name: true, userId: true, sort: true },
  });
  const seat = pickSeat(holders.map((h) => ({ id: h.id, label: h.name, userId: h.userId, sort: h.sort })), []);
  // Nobody sits in the role: the raise goes to the seat above it, and the form says which role that is.
  const knowledge = seat === null ? await loadKnowledge(co.id) : null;
  const above = knowledge ? seatAbove(knowledge, area.roleId) : null;
  const viaRole = above ? knowledge?.roles.find((r) => r.id === above.roleId)?.title ?? null : null;

  return (
    <RaiseForm
      slug={company}
      areaKey={area.key}
      areaName={area.name}
      unitName={area.unit.name}
      roleTitle={area.role.title}
      vacant={seat === null}
      viaRole={viaRole}
      anonymousAllowed={area.anonymous}
      signedInName={signedIn?.name ?? null}
      signInHref={`${base}/sign-in`}
    />
  );
}
