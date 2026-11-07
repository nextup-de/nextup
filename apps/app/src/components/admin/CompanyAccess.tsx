"use client";
// How one company's people get in: a personal login code each, and optionally Microsoft.
// Folded away under each company row in the platform admin - it is looked at when someone joins or
// loses their code. The company admin's People page shows it unfolded (`open`).
import { useActionState } from "react";
import { setEntraTenantAction, type CompanyRow, type TenantState } from "@/server/actions/admin";
import { SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import { PeopleAccess } from "./PeopleAccess";
import c from "@/app/admin/people/console.module.css";

export function CompanyAccess({ company, open = false }: { company: CompanyRow; open?: boolean }) {
  const t = useT();
  const [tenant, saveTenant, saving] = useActionState<TenantState, FormData>(setEntraTenantAction, {});
  const withCode = company.persons.filter((p) => p.codeIssuedAt).length;
  const summary = [
    t("adminConsole.accessSummary", { withCode, total: company.persons.length }),
    ...(company.entraTenantId ? [t("adminConsole.accessMicrosoftOn")] : []),
  ].join(" · ");

  const body = (
    <>
      <SectionCard title={t("adminConsole.accessTitle")} hint={summary} name="access">
        <PeopleAccess company={company} />
      </SectionCard>

      <SectionCard title={t("adminConsole.tenantTitle")} name="microsoft">
        <form action={saveTenant} className={`${c.form} ${c.anchor}`} id="microsoft">
          <input type="hidden" name="slug" value={company.slug} />
          <label className={c.label} htmlFor={`tenant-${company.slug}`}>{t("adminConsole.tenantLabel")}</label>
          <div className={c.inline}>
            <input
              className="nh-input"
              id={`tenant-${company.slug}`}
              name="tenantId"
              defaultValue={company.entraTenantId ?? ""}
              placeholder="72f988bf-86f1-41af-91ab-2d7cd011db47"
              spellCheck={false}
            />
            <button className={c.btn} type="submit" disabled={saving}>{t("adminConsole.tenantSave")}</button>
          </div>
          {tenant.error ? <p className={c.note} data-tone="error" role="alert">{tenant.error}</p> : null}
          {tenant.saved ? <p className={c.note} role="status">{t("adminConsole.tenantSaved")}</p> : null}
          <p className={c.note}>
            {t("adminConsole.tenantCallback")} <code className={c.mono}>{company.microsoftCallback}</code>
          </p>
        </form>
      </SectionCard>
    </>
  );

  if (open) return body;
  return (
    <details>
      <summary>{t("adminConsole.accessTitle")} <span className={c.sub}>· {summary}</span></summary>
      {body}
    </details>
  );
}
