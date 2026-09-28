// People (company admin only): everyone in this company, whether they can sign in, a new personal
// login code when someone joins or loses theirs, and the "Continue with Microsoft" switch.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyAccess } from "@/components/admin/CompanyAccess";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import styles from "../admin.module.css";

export default async function PeoplePage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  // The platform admin has this per company, under Companies.
  if (ctx.scope !== "company") notFound();
  if (!ctx.company) return <CompanyMissing />;

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
    </section>
  );
}
