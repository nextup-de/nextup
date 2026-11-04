"use client";
// How one company's people get in: a personal login code each, and optionally Microsoft.
// Folded away under each company row in the platform admin - it is looked at when someone joins or
// loses their code. The company admin's People page shows it unfolded (`open`).
import { useActionState } from "react";
import {
  issueLoginCodeAction,
  setEntraTenantAction,
  type CompanyRow,
  type LoginCodeState,
  type TenantState,
} from "@/server/actions/admin";
import { DataTable, PersonFace, SectionCard, type Column } from "@/components/ui/elements";
import { useFormat, useT } from "@/i18n/client";
import c from "@/app/admin/people/console.module.css";

type Person = CompanyRow["persons"][number];

export function CompanyAccess({ company, open = true }: { company: CompanyRow; open?: boolean }) {
  const t = useT();
  const f = useFormat();
  const [issued, issue, issuing] = useActionState<LoginCodeState, FormData>(issueLoginCodeAction, {});
  const [tenant, saveTenant, saving] = useActionState<TenantState, FormData>(setEntraTenantAction, {});
  const withCode = company.persons.filter((p) => p.codeIssuedAt).length;
  const summary = [
    t("adminConsole.accessSummary", { withCode, total: company.persons.length }),
    ...(company.entraTenantId ? [t("adminConsole.accessMicrosoftOn")] : []),
  ].join(" · ");

  const columns: Column<Person>[] = [
    {
      key: "person",
      header: t("adminConsole.colPerson"),
      width: "minmax(0, 1.6fr)",
      render: (p) => (
        <div className={c.who}>
          <PersonFace name={p.name} />
          <span className={c.whoText}>
            <span className={c.strong}>{p.name}</span>
            <span className={c.sub}>{p.role} · {p.email}</span>
          </span>
        </div>
      ),
    },
    {
      key: "signin",
      header: t("adminConsole.colSignIn"),
      width: "minmax(0, 1fr)",
      render: (p) => (
        <>
          <span>{p.codeIssuedAt ? t("adminConsole.codeSince", { date: f.date(p.codeIssuedAt, "day") }) : t("adminConsole.codeNone")}</span>
          {p.microsoft ? <span className={c.sub}>{t("adminConsole.microsoftLinked")}</span> : null}
        </>
      ),
    },
    {
      key: "action",
      header: "",
      width: "120px",
      render: (p) => (
        <button className={c.btn} type="submit" name="userId" value={p.id} disabled={issuing}>
          {p.codeIssuedAt ? t("adminConsole.newCode") : t("adminConsole.issueCode")}
        </button>
      ),
    },
  ];

  const body = (
    <>
      <SectionCard title={t("adminConsole.accessTitle")} hint={summary} name="access">
        {issued.code ? (
          <div className={c.codeBox}>
            <strong>{t("adminConsole.codeFor", { name: issued.name ?? "" })}</strong>
            <div className={c.code}>{issued.code}</div>
            <p className={c.note}>{t("adminConsole.codeGive", { name: issued.name ?? "" })}</p>
          </div>
        ) : null}
        {issued.error ? <p className={c.note} data-tone="error" role="alert">{issued.error}</p> : null}
        <form action={issue}>
          <input type="hidden" name="slug" value={company.slug} />
          <DataTable columns={columns} rows={company.persons} rowKey={(p) => p.id} empty={t("adminConsole.none")} />
        </form>
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
