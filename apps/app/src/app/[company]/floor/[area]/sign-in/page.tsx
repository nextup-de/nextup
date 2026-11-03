// Floor-code sign-in for one area (plan FLR, D9): six digits on a keypad of its own.
import { SignInForm } from "@/components/floor/SignInForm";
import styles from "@/components/floor/Floor.module.css";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { findArea } from "@/lib/db/floor";
import { hasDatabase } from "@/lib/db/mode";

export async function generateMetadata() {
  return { title: (await getT())("floor.signInHeading") };
}

export default async function FloorSignInPage({ params }: { params: Promise<{ company: string; area: string }> }) {
  const { company, area: areaKey } = await params;
  const t = await getT();
  const co = hasDatabase() ? await getDb().company.findUnique({ where: { slug: company }, select: { id: true } }) : null;
  const area = co ? await findArea(co.id, areaKey) : null;
  if (!area) return <p className={styles.heading} data-testid="floor-signin-state">{t("floor.unknownTitle")}</p>;
  if (!area.on) return <p className={styles.heading} data-testid="floor-signin-state">{t("floor.pausedTitle")}</p>;
  return (
    <SignInForm
      slug={company}
      areaName={area.name}
      raiseHref={`${companyPrefix(company)}/floor/${area.key}`}
      anonymousAllowed={area.anonymous}
    />
  );
}
