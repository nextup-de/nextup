// STEP 2 of login: company-branded login. Your personal code or your Microsoft account says who
// you are (src/server/actions/auth.ts, src/server/microsoft-login.ts); a demo box adds a
// clearly-labelled "open the demo" button for demo-stage companies (src/server/demo-login.ts).
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell, AuthTitle, AuthFoot, AuthStats } from "@/components/auth/AuthShell";
import { CompanyLoginForm } from "@/components/auth/CompanyLoginForm";
import { DemoButton } from "@/components/auth/DemoButton";
import { Button } from "@/components/ui/Button";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { SITE } from "@/config/site";
import { isMicrosoftError, MICROSOFT_ERRORS } from "@/features/auth/entra";
import { demoPersonFor } from "@/server/demo-login";
import { companyPrefix, microsoftEnabledFor, safeNext } from "@/server/microsoft-login";
import styles from "@/components/auth/forms.module.css";

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ next?: string; error?: string }> };

export async function generateMetadata({ params }: Props) {
  const tenant = await findTenant((await params).company);
  return { title: `Log in to ${tenant?.name ?? "your company"}` };
}

export default async function CompanyLoginPage({ params, searchParams }: Props) {
  const { company } = await params;
  const { next: rawNext, error } = await searchParams;
  const tenant = await findTenant(company);
  if (!tenant) notFound(); // the layout 404s too, but layouts and pages render in parallel
  const short = tenant.name.split(" ")[0];
  const next = safeNext(rawNext) || undefined;

  const [microsoft, demoPerson] = hasDatabase()
    ? await Promise.all([microsoftEnabledFor(tenant.slug), demoPersonFor(tenant.slug)])
    : [false, null];
  const microsoftHref = microsoft
    ? `${companyPrefix(tenant.slug)}/login/microsoft${next ? `?next=${encodeURIComponent(next)}` : ""}`
    : null;

  return (
    <AuthShell
      art="hand"
      backHref="/login"
      side={
        <>
          <p className="nh-eyebrow">This week at {short}</p>
          <AuthStats items={[["26 h", "median to first answer"], ["84 %", `within the ${SITE.promiseDays}-day promise`], ["3", "decisions waiting on you"]]} />
          <p>Numbers from the manager overview. Empty inbox by end of day is the whole ritual.</p>
        </>
      }
    >
      <div className={styles.company}>
        <span className={styles.mark} aria-hidden="true">{tenant.mark}</span>
        <div>
          <strong>{tenant.name}</strong>
        </div>
        <Link className={styles.switch} href="/login">Not your company?</Link>
      </div>

      {hasDatabase() ? (
        <>
          <AuthTitle
            title="Welcome back"
            sub={microsoftHref ? "Log in with your personal code or your Microsoft work account." : "Log in with your personal code."}
          />
          <CompanyLoginForm
            slug={tenant.slug}
            short={short}
            next={next}
            microsoftHref={microsoftHref}
            microsoftError={isMicrosoftError(error) ? MICROSOFT_ERRORS[error] : undefined}
          />
          <DemoButton slug={tenant.slug} next={next} person={demoPerson} />
        </>
      ) : (
        // No database, so there is no one to sign in as: a laptop without Postgres. The demo
        // needs no login - send them straight in rather than to a form that can only say no.
        // `?as=member`: through the login you always arrive as the employee (RoleRouter).
        <>
          <AuthTitle title="Demo mode" sub="No database is connected, so there is nothing to log in to. The built-in demo works without one." />
          <Button href={`/${tenant.slug}?as=member`} block>Open the {short} demo</Button>
        </>
      )}

      <AuthFoot>No code yet, or lost it? Ask your team leader - they can give you a new one.</AuthFoot>
    </AuthShell>
  );
}
