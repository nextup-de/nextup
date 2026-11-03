"use client";
// Console connectors: Jira, Cloud or Data Center. The token is typed here, goes to the server and never
// comes back: the block only knows "set" or "not set". Data Center takes a base URL and a personal
// access token, no email.
import { useState, useTransition } from "react";
import { jiraStatus } from "@/features/connectors/status";
import { useFormat, useT } from "@/i18n/client";
import type { JiraForm } from "@/features/admin/jira-admin";
import { saveConsoleJira, setConsoleJiraOn, syncConsoleJiraNow, testConsoleJira, type ConsoleConnectorState, type ConsoleJiraTestState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import { ConnectorCard, Row, STATUS_KEY, Switch, type Note } from "./ConnectorCard";
import type { JiraBlockView } from "./views";
import c from "./Connectors.module.css";

const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" /></svg>
);

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
  const status = jiraStatus(view);
  const notes: Note[] = [];
  if (status === "error" && view.lastError) notes.push({ tone: "error", text: `${t("adminConnectors.jiraLastError")}: ${view.lastError}` }, { tone: "plain", text: t("adminConnectors.jiraWaits") });
  if (!view.vault) notes.push({ tone: "warn", text: t("adminConnectors.errNoVault") });
  const site = [view.form.siteUrl, view.form.projectKey].filter(Boolean).join(" · ");

  return (
    <ConnectorCard
      id="jira" testId="console-connectors-jira" icon={<LinkIcon />} title={t("adminConnectors.jiraTitle")}
      status={status} statusLabel={t(STATUS_KEY[status])} lede={t("adminConnectors.jiraLede")} notes={notes}
      toggle={<Switch on={view.on} label={t("adminConnectors.switchLabel", { name: t("adminConnectors.jiraTitle") })} testId="console-connectors-jira-switch"
        disabled={off || (!view.on && !view.configured)} onChange={(next) => act(() => setConsoleJiraOn(next))} />}
      factsTitle={t("adminConnectors.readsTitle")}
      facts={[
        { label: t("adminConnectors.factWrites"), value: t("adminConnectors.jiraWrites") },
        { label: t("adminConnectors.factReads"), value: t("adminConnectors.jiraReadsText") },
        { label: t("adminConnectors.factNeverReads"), value: t("adminConnectors.jiraNever") },
        ...(site ? [{ label: t("adminConnectors.factSite"), value: site }] : []),
      ]}>
      <div className={c.fields}>
        <h3 className={c.sub}>{t("adminConnectors.connectionTitle")}</h3>
        <Row label={t("adminConnectors.jiraFlavor")}>
          <div className={c.seg} role="group" aria-label={t("adminConnectors.jiraFlavor")} data-testid="console-connectors-jira-flavor">
            <button type="button" aria-pressed={!dc} disabled={readOnly} onClick={() => set("flavor", "cloud")}>{t("adminConnectors.jiraCloud")}</button>
            <button type="button" aria-pressed={dc} disabled={readOnly} onClick={() => set("flavor", "dc")}>{t("adminConnectors.jiraDc")}</button>
          </div>
        </Row>
        <Row id="cj-url" label={t("adminConnectors.jiraUrl")}>
          <input className={c.input} id="cj-url" data-testid="console-connectors-jira-url" value={form.siteUrl} disabled={readOnly} onChange={(e) => set("siteUrl", e.target.value)} autoComplete="off" />
        </Row>
        {dc ? null : (
          <Row id="cj-email" label={t("adminConnectors.jiraEmail")}>
            <input className={c.input} id="cj-email" type="email" data-testid="console-connectors-jira-email" value={form.email} disabled={readOnly} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Row>
        )}
        <Row id="cj-token" label={dc ? t("adminConnectors.jiraPat") : t("adminConnectors.jiraToken")} hint={t("adminConnectors.jiraTokenHint")}>
          <span className={c.secret}>
            <input className={c.input} id="cj-token" type="password" data-testid="console-connectors-jira-token-input" value={form.token} disabled={readOnly}
              onChange={(e) => set("token", e.target.value)} autoComplete="new-password" />
            <span className={c.hint} data-testid="console-connectors-jira-token">{t(view.token === "set" ? "adminConnectors.set" : "adminConnectors.notSet")}</span>
          </span>
        </Row>
        <Row id="cj-key" label={t("adminConnectors.jiraProjectKey")}>
          <input className={c.input} data-size="short" id="cj-key" value={form.projectKey} disabled={readOnly} onChange={(e) => set("projectKey", e.target.value.toUpperCase())} autoComplete="off" />
        </Row>
        <div className={c.pair}>
          <label className={c.field}><span className={c.label}>{t("adminConnectors.jiraEpicType")}</span>
            <input className={c.input} id="cj-epic" inputMode="numeric" value={form.epicTypeId} disabled={readOnly} onChange={(e) => set("epicTypeId", e.target.value.trim())} /></label>
          <label className={c.field}><span className={c.label}>{t("adminConnectors.jiraStepType")}</span>
            <input className={c.input} id="cj-step" inputMode="numeric" value={form.stepTypeId} disabled={readOnly} onChange={(e) => set("stepTypeId", e.target.value.trim())} /></label>
        </div>
      </div>
      <div className={c.foot}>
        {note && !note.ok ? <p className={c.status} data-tone="error" role="alert">{t(CODE_KEY[note.code])}{note.detail ? ` ${note.detail}` : ""}</p> : null}
        {note?.ok ? <p className={c.status} role="status">{t("adminConnectors.saved")}</p> : null}
        <button type="button" className={c.btn} data-testid="console-connectors-jira-test" disabled={off} onClick={() => { setNote(null); start(async () => setTest(await testConsoleJira(form))); }}>{t("adminConnectors.jiraTest")}</button>
        <button type="button" className={c.primary} data-testid="console-connectors-jira-save" disabled={off} onClick={() => act(async () => {
          const r = await saveConsoleJira(form);
          if (r.ok) set("token", "");
          return r;
        })}>{pending ? t("adminConnectors.working") : t("adminConnectors.save")}</button>
      </div>
      {test ? (
        <div className={c.fields} role="status">
          {test.code ? <p className={c.status} data-tone="error" role="alert">{t(CODE_KEY[test.code])}{test.detail ? ` ${test.detail}` : ""}</p> : null}
          {test.checks.length ? <p className={c.sub}>{test.ok ? t("adminConnectors.jiraTestOk") : t("adminConnectors.jiraTestFailed")}</p> : null}
          {test.checks.length ? (
            <ul className={c.checks}>
              {test.checks.map((x) => <li key={x.id} data-ok={x.ok}><span aria-hidden="true">{x.ok ? "✓" : "✗"}</span><strong>{x.label}</strong><span className={c.checkDetail}>{x.detail}</span></li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={c.sync}>
        <span><strong>{t("adminConnectors.syncTitle")}</strong> · {t("adminConnectors.syncLine", { run: when(view.lastRunAt), ok: when(view.lastOkAt) })}</span>
        {view.on ? <button type="button" className={c.btn} data-testid="console-connectors-jira-sync" disabled={off} onClick={() => act(syncConsoleJiraNow)}>{t("adminConnectors.jiraSyncNow")}</button> : null}
      </div>
    </ConnectorCard>
  );
}
