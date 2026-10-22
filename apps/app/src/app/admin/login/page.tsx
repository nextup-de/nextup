// Unlocks the admin area with ADMIN_ACCESS_CODE, or - on a company stack with Microsoft sign-in -
// with a Microsoft account that holds the NextUp.Admin app role. Not a user account: the admin area
// sits outside the role system.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { adminScope } from "@/features/admin/nav";
import { isMicrosoftError, MICROSOFT_ERRORS } from "@/features/auth/entra";
import { companyPrefix } from "@/features/tenant/urls";
import { microsoftAdminEnabled } from "@/server/microsoft-login";
import styles from "../admin.module.css";

/**
 * ADMIN_DEMO_FILL=true puts a "Demo code" button in the field so the code does not have to be
 * typed in front of a room. It sends ADMIN_ACCESS_CODE to the browser - only ever on a demo box,
 * never on a box whose admin area is worth protecting.
 */
function demoCode(): string | null {
  if (process.env.ADMIN_DEMO_FILL !== "true") return null;
  return process.env.ADMIN_ACCESS_CODE ?? null;
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect(process.env.TENANT_MODE === "subdomain" ? "/" : "/admin");
  const { error } = await searchParams;
  const slug = process.env.COMPANY_SLUG?.trim();
  const microsoft = slug && (await microsoftAdminEnabled()) ? `${companyPrefix(slug)}/login/microsoft?as=admin` : null;
  return (
    <section className={styles.card}>
      <h1>Admin</h1>
      <p className="nh-hint">
        {adminScope() === "company"
          ? "Hand out your people’s login codes, switch on Microsoft sign-in, and set what the assistant may read."
          : "Add a company, hand out its people’s login codes, or remove it."}
      </p>
      {microsoft ? (
        <>
          {/* A plain link: the sign-in starts on a route handler that redirects to Microsoft. */}
          <a className="nh-btn nh-btn-primary" href={microsoft}>Continue with Microsoft</a>
          <p className="nh-hint">Or use the admin code, kept for when Microsoft is not available.</p>
        </>
      ) : null}
      {isMicrosoftError(error) ? <p className={styles.error} role="alert">{MICROSOFT_ERRORS[error]}</p> : null}
      <AdminLoginForm demoCode={demoCode()} />
    </section>
  );
}
