"use client";
// Console connectors: the directory sync (SFX-C1, D10). Source (Entra | SuccessFactors), switch, Run now, last
// run, counts and last error; for SuccessFactors also the credentials form with Test connection. The private key
// is typed here, goes to the server and never comes back: the block only knows "set" or "not set".
import { useState, useTransition } from "react";
import { directoryStatus } from "@/features/connectors/status";
import type { DirectorySourceKind } from "@/features/directory";
import { useFormat, useT } from "@/i18n/client";
import { runDirectoryNowAction, setDirectoryAction } from "@/server/actions/directory-admin";
import { saveSuccessFactorsAction, testSuccessFactorsAction, type SuccessFactorsTestState } from "@/server/actions/successfactors-admin";
import type { ConsoleConnectorState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import { ConnectorCard, Row, STATUS_KEY, Switch, type Note } from "./ConnectorCard";
import type { DirectoryBlockView } from "./views";
import c from "./Connectors.module.css";

const TreeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></svg>
);

export function DirectoryBlock({ view, readOnly }: { view: DirectoryBlockView; readOnly: boolean }) {
  const t = useT();
  const f = useFormat();
  const [source, setSource] = useState<DirectorySourceKind>(view.source);
  const [form, setForm] = useState({ ...view.successFactors, privateKey: "" });
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [test, setTest] = useState<SuccessFactorsTestState | null>(null);
  const [pending, start] = useTransition();
  const off = pending || readOnly;
  const status = directoryStatus(view);
  const sf = source === "successfactors";
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const act = (fn: () => Promise<ConsoleConnectorState>) => { setNote(null); start(async () => setNote(await fn())); };
  const when = (iso: string | null) => (iso ? f.date(iso, "dateTime") : t("adminConnectors.never"));
  const notes: Note[] = [];
  if (status === "off") notes.push({ tone: "plain", text: t("adminConnectors.dirOffLine") });
  if (view.lastError) notes.push({ tone: "error", text: `${t("adminConnectors.dirLastError")}: ${view.lastError}` }, { tone: "plain", text: t("adminConnectors.dirWaits") });
  if (sf && !view.vault) notes.push({ tone: "warn", text: t("adminConnectors.errNoVault") });
  const testLine = test === null ? null : test.ok ? t("adminConnectors.sfTestOk") : `${t("adminConnectors.sfTestFailed")}: ${test.detail === "not configured" ? t("adminConnectors.sfTestNotConfigured") : test.detail}`;
  return (
    <ConnectorCard
      id="directory" testId="console-connectors-directory" icon={<TreeIcon />} title={t("adminConnectors.dirTitle")}
      status={status} statusLabel={t(STATUS_KEY[status])} lede={t("adminConnectors.dirLede")} notes={notes}
      toggle={<Switch on={view.on} label={t("adminConnectors.switchLabel", { name: t("adminConnectors.dirTitle") })} testId="console-connectors-directory-switch"
        disabled={off} onChange={(next) => act(() => setDirectoryAction(next, source))} />}
      factsTitle={t("adminConnectors.readsTitle")}
      facts={[
        { label: t("adminConnectors.factReads"), value: t("adminConnectors.dirReads") },
        { label: t("adminConnectors.factNeverReads"), value: t("adminConnectors.dirNever") },
      ]}>
      <div className={c.fields}>
        <Row id="dir-source" label={t("adminConnectors.dirSource")}>
          <select className={c.input} id="dir-source" data-testid="console-connectors-directory-source" value={source} disabled={off}
            onChange={(e) => { const next = e.target.value === "successfactors" ? "successfactors" : "graph"; setSource(next); act(() => setDirectoryAction(view.on, next)); }}>
            <option value="graph">{t("adminConnectors.dirSourceGraph")}</option>
            <option value="successfactors">{t("adminConnectors.dirSourceSuccessfactors")}</option>
          </select>
        </Row>
        {sf ? <p className={c.hint} data-testid="console-connectors-directory-orgchart">{t("adminConnectors.dirOrgChartOnly")}</p> : null}
      </div>
      {sf ? (
        <div className={c.fields} data-testid="console-connectors-directory-credentials">
          <h3 className={c.sub}>{t("adminConnectors.sfTitle")}</h3>
          <Row id="sf-host" label={t("adminConnectors.sfHost")} hint={t("adminConnectors.sfHostHint")}>
            <input className={c.input} id="sf-host" data-testid="console-connectors-sf-host" value={form.apiHost} disabled={readOnly} onChange={(e) => set("apiHost", e.target.value)} autoComplete="off" />
          </Row>
          <Row id="sf-company" label={t("adminConnectors.sfCompanyId")}>
            <input className={c.input} id="sf-company" value={form.companyId} disabled={readOnly} onChange={(e) => set("companyId", e.target.value)} autoComplete="off" />
          </Row>
          <Row id="sf-client" label={t("adminConnectors.sfClientId")}>
            <input className={c.input} id="sf-client" value={form.clientId} disabled={readOnly} onChange={(e) => set("clientId", e.target.value)} autoComplete="off" />
          </Row>
          <Row id="sf-user" label={t("adminConnectors.sfApiUser")}>
            <input className={c.input} id="sf-user" value={form.apiUserId} disabled={readOnly} onChange={(e) => set("apiUserId", e.target.value)} autoComplete="off" />
          </Row>
          <Row id="sf-key" label={t("adminConnectors.sfKey")} hint={t("adminConnectors.sfKeyHint")}>
            <span className={c.secret}>
              <textarea className={c.input} id="sf-key" rows={4} data-testid="console-connectors-sf-key-input" value={form.privateKey} disabled={readOnly}
                onChange={(e) => set("privateKey", e.target.value)} autoComplete="off" spellCheck={false} />
              <span className={c.hint} data-testid="console-connectors-sf-key">{t(view.key === "set" ? "adminConnectors.set" : "adminConnectors.notSet")}</span>
            </span>
          </Row>
          <div className={c.foot}>
            <button type="button" className={c.btn} data-testid="console-connectors-sf-test" disabled={off} onClick={() => { setNote(null); start(async () => setTest(await testSuccessFactorsAction())); }}>{t("adminConnectors.sfTest")}</button>
            <button type="button" className={c.primary} data-testid="console-connectors-sf-save" disabled={off} onClick={() => act(async () => {
              const r = await saveSuccessFactorsAction(form);
              if (r.ok) set("privateKey", "");
              return r;
            })}>{pending ? t("adminConnectors.working") : t("adminConnectors.save")}</button>
          </div>
          {testLine ? <p className={c.status} data-tone={test?.ok ? undefined : "error"} role="status" data-testid="console-connectors-sf-test-result">{testLine}</p> : null}
        </div>
      ) : null}
      <div className={c.foot}>
        {note && !note.ok ? <p className={c.status} data-tone="error" role="alert">{t(CODE_KEY[note.code])}{note.detail ? ` ${note.detail}` : ""}</p> : null}
        {note?.ok ? <p className={c.status} role="status">{t("adminConnectors.saved")}</p> : null}
      </div>
      <div className={c.sync}>
        <span data-testid="console-connectors-directory-on">
          <strong>{t("adminConnectors.syncTitle")}</strong> · {t(view.on ? "adminConnectors.on" : "adminConnectors.off")}
          {" · "}<span data-testid="console-connectors-directory-run">{t("adminConnectors.dirLastRun")}: {when(view.lastRunAt)}</span>
          {" · "}{t("adminConnectors.dirLastOk")}: {when(view.lastOkAt)}
          <br /><span data-testid="console-connectors-directory-counts">{t("adminConnectors.dirCounts", { ...view.counts })}</span>
        </span>
        {view.on ? <button type="button" className={c.btn} data-testid="console-connectors-directory-run-now" disabled={off} onClick={() => act(runDirectoryNowAction)}>{t("adminConnectors.dirRunNow")}</button> : null}
      </div>
      <span className={c.hint}>{t("adminConnectors.dirHint")}</span>
    </ConnectorCard>
  );
}
