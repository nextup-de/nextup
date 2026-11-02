// STEP 2 of login: company-branded login. Your personal code or your Microsoft account says who
// you are (src/server/actions/auth.ts, src/server/microsoft-login.ts); a demo box adds a
// clearly-labelled "open the demo" button for demo-stage companies (src/server/demo-login.ts).
import { companyFinderUrl, tenantMode } from "@/features/tenant/urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell, AuthTitle, AuthFoot, AuthStats } from "@/components/auth/AuthShell";
import { CompanyLoginForm } from "@/components/auth/CompanyLoginForm";
import { DemoButton } from "@/components/auth/DemoButton";
import { Button } from "@/components/ui/Button";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { SITE } from "@/config/site";
import { getT } from "@/i18n/server";
import { isMicrosoftError, MICROSOFT_ERRORS } from "@/features/auth/entra";
import { demoPersonFor } from "@/server/demo-login";
import { companyPrefix, microsoftEnabledFor, safeNext } from "@/server/microsoft-login";
import styles from "@/components/auth/forms.module.css";

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ next?: string; error?: string }> };

export async function generateMetadata({ params }: Props) {
  const tenant = await findTenant((await params).company);
  const t = await getT();
  return { title: t("auth.metaLogInTo", { name: tenant?.name ?? t("auth.yourCompany") }) };
}

export default async function CompanyLoginPage({ params, searchParams }: Props) {
  const { company } = await params;
  const t = await getT();
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
      step="company"
      backHref={companyFinderUrl()}
      side={
        // Sample numbers are for demo-stage companies only; a real company's login shows no numbers (D20).
        (tenant.stage ?? "demo") !== "demo" ? undefined : (
        <>
          <p className="nh-eyebrow">{t("auth.weekAt", { short })}</p>
          <AuthStats items={[["26 h", t("auth.statMedian")], ["84 %", t("auth.statWithin", { days: SITE.promiseDays })], ["3", t("auth.statWaiting")]]} />
          <p>{t("auth.sideNote")}</p>
        </>
        )
      }
    >
      <div className={styles.company}>
        <span className={styles.mark} aria-hidden="true">{tenant.mark}</span>
        <div>
          <strong>{tenant.name}</strong>
        </div>
        {/* A single-company stack has no other company to switch to - its /login is this page. */}
        {tenantMode() !== "single" && <Link className={styles.switch} href="/login">{t("auth.notYourCompany")}</Link>}
      </div>

      {hasDatabase() ? (
        <>
          <AuthTitle
            title={t("auth.welcomeBack")}
            sub={microsoftHref ? t("auth.subCodeMicrosoft") : t("auth.subCode")}
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
          <AuthTitle title={t("auth.demoModeTitle")} sub={t("auth.demoModeSub")} />
          <Button href={`${companyPrefix(tenant.slug) || "/"}?as=member`} block>{t("auth.openShortDemo", { short })}</Button>
        </>
      )}

      <AuthFoot>{t("auth.noCodeFoot")}</AuthFoot>
    </AuthShell>
  );
}
