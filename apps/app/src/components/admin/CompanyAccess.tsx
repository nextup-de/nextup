"use client";
// How one company's people get in: a personal login code each, and optionally Microsoft.
// Folded away under each company row - it is looked at when someone joins or loses their code.
import { useActionState } from "react";
import {
  issueLoginCodeAction,
  setEntraTenantAction,
  type CompanyRow,
  type LoginCodeState,
  type TenantState,
} from "@/server/actions/admin";
import styles from "@/app/admin/admin.module.css";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function CompanyAccess({ company }: { company: CompanyRow }) {
  const [issued, issue, issuing] = useActionState<LoginCodeState, FormData>(issueLoginCodeAction, {});
  const [tenant, saveTenant, saving] = useActionState<TenantState, FormData>(setEntraTenantAction, {});
  const withCode = company.persons.filter((p) => p.codeIssuedAt).length;

  return (
    <details className={styles.access}>
      <summary>
        People &amp; sign-in <span className={styles.rowMeta}>· {withCode} of {company.persons.length} have a login code
        {company.entraTenantId ? " · Microsoft on" : ""}</span>
      </summary>

      {issued.code ? (
        <div className={styles.ok}>
          <strong>Login code for {issued.name}</strong>
          <div className={styles.code}>{issued.code}</div>
          <p className="nh-hint">
            Give it to {issued.name} only - it logs in as them. Shown once; their previous code stopped
            working just now.
          </p>
        </div>
      ) : null}
      {issued.error ? <p className={styles.error} role="alert">{issued.error}</p> : null}

      <form action={issue} className={styles.accessPeople}>
        <input type="hidden" name="slug" value={company.slug} />
        {company.persons.map((p) => (
          <div key={p.id} className={styles.accessPerson}>
            <span>
              <strong>{p.name}</strong> <span className={styles.rowMeta}>· {p.role} · {p.email}</span>
            </span>
            <span className={styles.rowMeta}>
              {p.codeIssuedAt ? `Code since ${when(p.codeIssuedAt)}` : "No code yet"}
              {p.microsoft ? " · Microsoft linked" : ""}
            </span>
            <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" name="userId" value={p.id} disabled={issuing}>
              {p.codeIssuedAt ? "New code" : "Issue code"}
            </button>
          </div>
        ))}
      </form>

      <form action={saveTenant} className={styles.accessTenant}>
        <input type="hidden" name="slug" value={company.slug} />
        <label className={styles.rowMeta} htmlFor={`tenant-${company.slug}`}>
          Continue with Microsoft - the company&apos;s Entra tenant ID (empty = off)
        </label>
        <div className={styles.accessTenantRow}>
          <input
            className="nh-input"
            id={`tenant-${company.slug}`}
            name="tenantId"
            defaultValue={company.entraTenantId ?? ""}
            placeholder="72f988bf-86f1-41af-91ab-2d7cd011db47"
            spellCheck={false}
          />
          <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={saving}>Save</button>
        </div>
        {tenant.error ? <p className={styles.error} role="alert">{tenant.error}</p> : null}
        {tenant.saved ? <p className="nh-hint" role="status">Saved.</p> : null}
        <p className="nh-hint">
          Add this redirect URI to the NextUp app registration in Entra, and have their IT admin
          consent to the app: <code>{company.microsoftCallback}</code>
        </p>
      </form>
    </details>
  );
}
