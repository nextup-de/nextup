// People (company admin only): everyone in this company, whether they can sign in, a new personal
// login code when someone joins or loses theirs, and the "Continue with Microsoft" switch.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { consoleCompany } from "@/server/console-guard";
import { getDb } from "@/lib/db/client";
import { getT } from "@/i18n/server";
import { StackAdminSwitch } from "@/components/admin/StackAdminSwitch";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyAccess } from "@/components/admin/CompanyAccess";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import { TotpReset } from "./TotpReset";
import styles from "../admin.module.css";

export default async function PeoplePage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  // The platform admin has this per company, under Companies.
  if (!(await consoleCompany())) notFound();
  if (!ctx.company) return <CompanyMissing />;

  const t = await getT();
  const people = ctx.live
    ? await getDb().user.findMany({
        where: { company: { slug: ctx.company.slug }, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isStackAdmin: true, totpEnabledAt: true },
      })
    : [];

  return (
    <section className={styles.card}>
      <h1>People</h1>
      <p className="nh-hint">
        Everyone gets their own login code. Issuing a new one stops the old one at once - that is also
        how a lost or leaked code is switched off. Adding people and changing roles is in the
        dashboard, under Settings → Members.
      </p>
      {ctx.live ? (
        <CompanyAccess company={ctx.company} open />
      ) : (
        <p className="nh-hint">Login codes are stored in the database, which is not answering right now.</p>
      )}
      {people.length ? (
        <>
          <h2>{t("adminAccess.stackAdminTitle")}</h2>
          {people.map((p) => (
            <div key={p.id}>
              <StackAdminSwitch slug={ctx.company!.slug} userId={p.id} name={p.name} isStackAdmin={p.isStackAdmin} hasTotp={Boolean(p.totpEnabledAt)} />
              {p.totpEnabledAt ? <TotpReset slug={ctx.company!.slug} userId={p.id} name={p.name} /> : null}
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}
