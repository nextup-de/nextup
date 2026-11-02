"use client";
// Console connectors: Jira, Cloud or Data Center. The token is typed here, goes to the server and never
// comes back: the block only knows "set" or "not set". Data Center takes a base URL and a personal
// access token, no email.
import { useState, useTransition } from "react";
import { Field } from "@/components/ui/Field";
import { useFormat, useT } from "@/i18n/client";
import type { JiraForm } from "@/features/admin/jira-admin";
import { saveConsoleJira, setConsoleJiraOn, syncConsoleJiraNow, testConsoleJira, type ConsoleConnectorState, type ConsoleJiraTestState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import type { JiraBlockView } from "./views";
import styles from "@/app/admin/admin.module.css";

export function JiraBlock({ view, readOnly }: { view: JiraBlockView; readOnly: boolean }) {
  const t = useT();
  const f = useFormat();
  const [form, setForm] = useState<JiraForm>({ ...view.form, token: "" });
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [test, setTest] = useState<ConsoleJiraTestState | null>(null);
  const [pending, start] = useTransition();
  const dc = form.flavor === "dc";
  const set = <K extends keyof JiraForm>(k: K, v: JiraForm[K]) => setForm((s) => ({ ...s, [k]: v }));
  const act = (fn: () => Promise<ConsoleConnectorState>) => { setNote(null); start(async () => setNote(await fn())); };
  const when = (iso: string | null) => (iso ? f.date(iso, "dateTime") : t("adminConnectors.never"));
  const off = pending || readOnly;

  return (
    <section className={styles.card} data-testid="console-connectors-jira">
      <h2>{t("adminConnectors.jiraTitle")}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>{t("adminConnectors.jiraToken_")}</th><td data-testid="console-connectors-jira-token">{t(view.token === "set" ? "adminConnectors.set" : "adminConnectors.notSet")}</td></tr>
            <tr><th>{t("adminConnectors.jiraLastRun")}</th><td>{when(view.lastRunAt)}</td></tr>
            <tr><th>{t("adminConnectors.jiraLastOk")}</th><td>{when(view.lastOkAt)}</td></tr>
          </tbody>
        </table>
      </div>
      {view.lastError ? <p className={styles.error} role="alert">{t("adminConnectors.jiraLastError")}: {view.lastError}</p> : null}
      {!view.vault ? <p className={styles.warn}>{t("adminConnectors.errNoVault")}</p> : null}
      <div className={styles.grid}>
        <Field id="cj-flavor" label={t("adminConnectors.jiraFlavor")}>
          <select className="nh-input" id="cj-flavor" data-testid="console-connectors-jira-flavor" value={form.flavor} disabled={readOnly} onChange={(e) => set("flavor", e.target.value)}>
            <option value="cloud">{t("adminConnectors.jiraCloud")}</option>
            <option value="dc">{t("adminConnectors.jiraDc")}</option>
          </select>
        </Field>
        <Field id="cj-url" label={t("adminConnectors.jiraUrl")}>
          <input className="nh-input" id="cj-url" data-testid="console-connectors-jira-url" value={form.siteUrl} disabled={readOnly} onChange={(e) => set("siteUrl", e.target.value)} autoComplete="off" />
        </Field>
        {dc ? null : (
          <Field id="cj-email" label={t("adminConnectors.jiraEmail")}>
            <input className="nh-input" id="cj-email" type="email" data-testid="console-connectors-jira-email" value={form.email} disabled={readOnly} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Field id="cj-token" label={dc ? t("adminConnectors.jiraPat") : t("adminConnectors.jiraToken")} hint={t("adminConnectors.jiraTokenHint")}>
          <input className="nh-input" id="cj-token" type="password" data-testid="console-connectors-jira-token-input" value={form.token} disabled={readOnly} onChange={(e) => set("token", e.target.value)} autoComplete="new-password" />
        </Field>
        <Field id="cj-key" label={t("adminConnectors.jiraProjectKey")}>
          <input className="nh-input" id="cj-key" value={form.projectKey} disabled={readOnly} onChange={(e) => set("projectKey", e.target.value.toUpperCase())} autoComplete="off" />
        </Field>
        <div className={styles.two}>
          <Field id="cj-epic" label={t("adminConnectors.jiraEpicType")}>
            <input className="nh-input" id="cj-epic" inputMode="numeric" value={form.epicTypeId} disabled={readOnly} onChange={(e) => set("epicTypeId", e.target.value.trim())} />
          </Field>
          <Field id="cj-step" label={t("adminConnectors.jiraStepType")}>
            <input className="nh-input" id="cj-step" inputMode="numeric" value={form.stepTypeId} disabled={readOnly} onChange={(e) => set("stepTypeId", e.target.value.trim())} />
          </Field>
        </div>
      </div>
      {test ? (
        <div role="status">
          {test.code ? <p className={styles.error} role="alert">{t(CODE_KEY[test.code])}{test.detail ? ` ${test.detail}` : ""}</p> : null}
          {test.checks.length ? (
            <ul className={styles.jiraChecks}>
              {test.checks.map((c) => <li key={c.id} data-ok={c.ok}><span aria-hidden="true">{c.ok ? "✓" : "✗"}</span><span><strong>{c.label}</strong><span className={styles.sub}>{c.detail}</span></span></li>)}
            </ul>
          ) : null}
          {test.checks.length ? <p className="nh-hint">{test.ok ? t("adminConnectors.jiraTestOk") : t("adminConnectors.jiraTestFailed")}</p> : null}
        </div>
      ) : null}
      {note && !note.ok ? <p className={styles.error} role="alert">{t(CODE_KEY[note.code])}{note.detail ? ` ${note.detail}` : ""}</p> : null}
      {note?.ok ? <p className="nh-hint" role="status">{t("adminConnectors.saved")}</p> : null}
      <div className={styles.jiraActions}>
        <button type="button" className="nh-btn nh-btn-primary" data-testid="console-connectors-jira-save" disabled={off} onClick={() => act(async () => {
          const r = await saveConsoleJira(form);
          if (r.ok) set("token", "");
          return r;
        })}>{pending ? t("adminConnectors.working") : t("adminConnectors.save")}</button>
        <button type="button" className="nh-btn" data-testid="console-connectors-jira-test" disabled={off} onClick={() => { setNote(null); start(async () => setTest(await testConsoleJira(form))); }}>{t("adminConnectors.jiraTest")}</button>
        {view.on ? (
          <>
            <button type="button" className="nh-btn" data-testid="console-connectors-jira-off" disabled={off} onClick={() => act(() => setConsoleJiraOn(false))}>{t("adminConnectors.jiraSwitchOff")}</button>
            <button type="button" className="nh-btn" data-testid="console-connectors-jira-sync" disabled={off} onClick={() => act(syncConsoleJiraNow)}>{t("adminConnectors.jiraSyncNow")}</button>
          </>
        ) : (
          <button type="button" className="nh-btn" data-testid="console-connectors-jira-on" disabled={off || !view.configured} onClick={() => act(() => setConsoleJiraOn(true))}>{t("adminConnectors.jiraSwitchOn")}</button>
        )}
      </div>
    </section>
  );
}
