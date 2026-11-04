"use client";
// Settings -> Sign-in and provisioning: six cards (personal codes, Entra, OIDC, SAML, SCIM, audit log export).
// Props in, JSX out: every change calls an action from server/actions/settings/sign-in.ts. The client secret
// and the new SCIM token are never kept after the box is closed.
import { useState, useTransition, type FormEvent } from "react";
import { Banner, ConfirmDialog, SecretOnce, SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  refreshSamlMetadataAction, replaceScimTokenAction, saveLogExportAction, saveOidcAction, saveSamlAction,
  sendTestRecordAction, setLogExportOnAction, setOidcOnAction, setSamlOnAction, setScimOnAction, type SignInResult,
} from "@/server/actions/settings/sign-in";
import { Foot, Row } from "./SettingsParts";
import s from "./settings.module.css";
import styles from "./SignInSettings.module.css";

type State = "off" | "on" | "needsYou" | "error" | "demo";
export type TestView = { at: string; ok: boolean; detail: string; name: string | null };
export type SignInView = {
  slug: string;
  company: string;
  demo: boolean;
  tested: "oidc" | "saml" | null;
  codes: { set: number; managers: number };
  entraTenantId: string | null;
  oidc: {
    state: State; on: boolean; saved: boolean; buttonText: string; issuer: string; clientId: string; scopes: string;
    hasSecret: boolean; redirectUrl: string; testHref: string; test: TestView | null;
  };
  saml: {
    state: State; on: boolean; saved: boolean; buttonText: string; metadataUrl: string; entityId: string; replyUrl: string;
    metadataHref: string; cert: { expiresAt: string; days: number; status: "ok" | "soon" | "expired" } | null;
    testHref: string; test: TestView | null;
  };
  scim: {
    state: State; on: boolean; endpoint: string; tokenCreatedAt: string | null; lastRequestAt: string | null;
    activity: { added: number; updated: number; deactivated: number };
  };
  logsink: {
    state: State; on: boolean; target: "off" | "syslog" | "file"; host: string; port: string; transport: "tls" | "tcp" | "udp";
    caPem: string; fileName: string; lastOkAt: string | null; sentToday: number; lastError: string | null; test: TestView | null;
  };
};

const STATE_LABEL: Record<State, MessageKey> = {
  on: "settingsSignIn.stateOn", off: "settingsSignIn.stateOff", needsYou: "settingsSignIn.stateNeedsYou",
  error: "settingsSignIn.stateError", demo: "settingsSignIn.stateDemo",
};
// What a failed SSO test stores as its detail (server/identity/finish.ts SsoErrorCode).
const SSO_CODE: Record<string, MessageKey> = {
  demo_company: "ssoLogin.demo_company", not_on: "ssoLogin.not_on", state: "ssoLogin.state", expired: "ssoLogin.expired",
  invalid_response: "ssoLogin.invalid_response", email_unverified: "ssoLogin.email_unverified", no_email: "ssoLogin.no_email",
  unknown_user: "ssoLogin.unknown_user", ambiguous: "ssoLogin.ambiguous", inactive: "ssoLogin.inactive", failed: "ssoLogin.failed",
};
const stamp = (iso: string) => iso.slice(0, 16).replace("T", " ");
const day = (iso: string) => iso.slice(0, 10);

type Card = "oidc" | "saml" | "scim" | "logsink";
type Ask = "oidc" | "saml" | "token" | null;

export function SignInSettings({ view }: { view: SignInView }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ card: Card; error: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [token, setToken] = useState<string | null>(null);
  const [samlSource, setSamlSource] = useState<"url" | "file" | "keep">(view.saml.saved ? "keep" : "url");
  const [samlXml, setSamlXml] = useState("");
  const [target, setTarget] = useState(view.logsink.target);
  const [exportTest, setExportTest] = useState<{ ok: boolean; detail: string; at: string } | null>(null);

  const run = (card: Card, call: () => Promise<SignInResult>, after?: (r: Extract<SignInResult, { ok: true }>) => void, okText: boolean = true) =>
    start(async () => {
      const r = await call();
      if (r.ok) {
        setMsg(okText ? { card, error: false, text: t("settingsSignIn.saved") } : null);
        after?.(r);
      } else {
        setMsg({ card, error: true, text: t(r.error, { errors: (r.errors ?? []).join("; ") }) });
      }
    });

  const fields = (e: FormEvent<HTMLFormElement>): Record<string, string> => {
    e.preventDefault();
    const out: Record<string, string> = {};
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string") out[k] = v;
    return out;
  };
  const note = (card: Card) =>
    msg?.card === card ? (
      <Foot status={msg.text} tone={msg.error ? "error" : undefined} statusTestId={`signin-msg-${card}`}>{null}</Foot>
    ) : null;
  const badge = (st: State) => <span className={styles.badge} data-state={st} data-testid="signin-badge">{t(STATE_LABEL[st])}</span>;
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).catch(() => undefined); };
  const url = (label: string, v: string) => (
    <div className={s.wellRow}>
      <dt>{label}</dt>
      <dd className={styles.copyLine}><span className={s.mono}>{v}</span> <button className={s.soft} type="button" onClick={() => copy(v)}>{t("settingsSignIn.copy")}</button></dd>
    </div>
  );
  const testLine = (v: TestView | null, sso: boolean) => {
    if (!v) return <span className={s.mute}>{t("settingsSignIn.testNone")}</span>;
    if (v.ok) return <span className={styles.ok}>{sso && v.name ? t("settingsSignIn.testOkMatched", { name: v.name }) : t("settingsSignIn.testOk", { at: stamp(v.at) })}</span>;
    const key = SSO_CODE[v.detail];
    const text = key ? t(key, { company: view.company }) : v.detail;
    return <span className={styles.fail}>{t("settingsSignIn.testFailed", { at: stamp(v.at), detail: text })}</span>;
  };
  const switcher = (card: Card, on: boolean, change: (on: boolean) => void, disabled: boolean) => (
    <label className={s.switch}>
      <input type="checkbox" checked={on} disabled={pending || disabled} data-testid={`signin-switch-${card}`} onChange={(e) => change(e.currentTarget.checked)} />
      {on ? t("settingsSignIn.on") : t("settingsSignIn.off")}
    </label>
  );
  const statusRow = (st: State, switchEl?: React.ReactNode) => <div className={styles.statusRow}>{badge(st)}{switchEl}</div>;
  const demoLine = view.demo ? <div data-testid="signin-demo"><Banner tone="quiet">{t("settingsSignIn.demo")}</Banner></div> : null;
  const confirmBox = (card: string, title: string, text: string, go: () => void) => (
    <ConfirmDialog title={title} text={text} confirmLabel={t("settingsSignIn.confirm")} cancelLabel={t("settingsSignIn.cancel")} testId={`signin-confirm-${card}`}
      onConfirm={() => { setAsk(null); go(); }} onCancel={() => setAsk(null)} />
  );
  const newToken = () => run("scim", () => replaceScimTokenAction(view.slug), (r) => setToken(r.token ?? null), false);

  const { oidc, saml, scim, logsink } = view;
  const certDays = saml.cert ? Math.abs(saml.cert.days) : 0;

  return (
    <div className={s.page}>
      <div data-testid="signin-codes">
        <SectionCard name="codes" title={t("settingsSignIn.codesTitle")} hint={t("settingsSignIn.codesText")}>
          {statusRow("on")}
          <dl className={`${s.well} ${styles.facts}`}>
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.codesSecondFactor")}</dt>
              <dd>{t("settingsSignIn.codesCount", { n: view.codes.set, m: view.codes.managers })}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <div data-testid="signin-entra">
        <SectionCard name="entra" title={t("settingsSignIn.entraTitle")} hint={t("settingsSignIn.entraText")}>
          {statusRow(view.entraTenantId ? "on" : "off")}
          <dl className={`${s.well} ${styles.facts}`}>
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.entraTenant")}</dt>
              <dd><span className={s.mono}>{view.entraTenantId ?? t("settingsSignIn.entraNone")}</span> · {t("settingsSignIn.entraConsole")}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <div data-testid="signin-oidc">
        <SectionCard name="oidc" title={t("settingsSignIn.oidcTitle")}>
          {statusRow(oidc.state, !view.demo ? switcher("oidc", oidc.on, (on) => (on ? setAsk("oidc") : run("oidc", () => setOidcOnAction(view.slug, false))), !oidc.saved) : null)}
          {demoLine}
          <form className={styles.form} key={`oidc-${oidc.buttonText}-${oidc.issuer}`} onSubmit={(e) => { const f = fields(e); run("oidc", () => saveOidcAction(view.slug, f)); }}>
            <fieldset disabled={view.demo || pending} className={styles.form}>
              <Row id="oidc-button" label={t("settingsSignIn.buttonText")}><input id="oidc-button" className={s.input} name="buttonText" maxLength={40} defaultValue={oidc.buttonText} required /></Row>
              <Row id="oidc-issuer" label={t("settingsSignIn.issuer")}><input id="oidc-issuer" className={s.input} name="issuer" type="url" defaultValue={oidc.issuer} required /></Row>
              <Row id="oidc-client" label={t("settingsSignIn.clientId")}><input id="oidc-client" className={s.input} name="clientId" defaultValue={oidc.clientId} required /></Row>
              <Row id="oidc-secret" label={`${t("settingsSignIn.clientSecret")} · ${oidc.hasSecret ? t("settingsSignIn.secretSet") : t("settingsSignIn.secretNotSet")}`} help={oidc.hasSecret ? t("settingsSignIn.secretKeep") : undefined}>
                <input id="oidc-secret" className={s.input} name="clientSecret" type="password" autoComplete="new-password" />
              </Row>
              <Row id="oidc-scopes" label={t("settingsSignIn.scopes")}><input id="oidc-scopes" className={s.input} name="scopes" defaultValue={oidc.scopes} /></Row>
              <Foot><button className={s.save} type="submit" data-testid="signin-save-oidc">{t("settingsSignIn.save")}</button></Foot>
            </fieldset>
          </form>
          <dl className={`${s.well} ${styles.facts}`}>{url(t("settingsSignIn.redirectUrl"), oidc.redirectUrl)}</dl>
          {!view.demo ? (
            <p className={styles.testRow}>
              <a className={s.soft} href={oidc.testHref} target="_blank" rel="noopener">{t("settingsSignIn.testSignIn")}</a>
              {testLine(oidc.test, true)}
            </p>
          ) : null}
          {note("oidc")}
        </SectionCard>
      </div>

      <div data-testid="signin-saml">
        <SectionCard name="saml" title={t("settingsSignIn.samlTitle")}>
          {statusRow(saml.state, !view.demo ? switcher("saml", saml.on, (on) => (on ? setAsk("saml") : run("saml", () => setSamlOnAction(view.slug, false))), !saml.saved) : null)}
          {demoLine}
          <form className={styles.form} key={`saml-${saml.buttonText}-${saml.metadataUrl}`} onSubmit={(e) => { const f = fields(e); run("saml", () => saveSamlAction(view.slug, { ...f, source: samlSource, metadataXml: samlXml })); }}>
            <fieldset disabled={view.demo || pending} className={styles.form}>
              <Row id="saml-button" label={t("settingsSignIn.buttonText")}><input id="saml-button" className={s.input} name="buttonText" maxLength={40} defaultValue={saml.buttonText} required /></Row>
              <Row label={t("settingsSignIn.idpMetadata")} top>
                <div className={styles.radios}>
                  {saml.saved ? <label className={styles.radio}><input type="radio" checked={samlSource === "keep"} onChange={() => setSamlSource("keep")} />{t("settingsSignIn.metadataKeep")}</label> : null}
                  <label className={styles.radio}><input type="radio" checked={samlSource === "url"} onChange={() => setSamlSource("url")} />{t("settingsSignIn.metadataUrl")}</label>
                  <label className={styles.radio}><input type="radio" checked={samlSource === "file"} onChange={() => setSamlSource("file")} />{t("settingsSignIn.metadataFile")}</label>
                </div>
                {samlSource === "url" ? <input className={s.input} name="metadataUrl" type="url" aria-label={t("settingsSignIn.metadataUrl")} defaultValue={saml.metadataUrl} required /> : null}
                {samlSource === "file" ? (
                  <input className={s.input} type="file" accept=".xml,text/xml,application/xml" aria-label={t("settingsSignIn.metadataFile")}
                    onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) void file.text().then(setSamlXml); }} />
                ) : null}
              </Row>
              <Foot><button className={s.save} type="submit" data-testid="signin-save-saml">{t("settingsSignIn.save")}</button></Foot>
            </fieldset>
          </form>
          <dl className={`${s.well} ${styles.facts}`}>
            {url(t("settingsSignIn.entityId"), saml.entityId)}
            {url(t("settingsSignIn.replyUrl"), saml.replyUrl)}
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.ourDetails")}</dt>
              <dd><a className={styles.link} href={saml.metadataHref} download>{t("settingsSignIn.spMetadata")}</a></dd>
            </div>
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.certificate")}</dt>
              <dd className={styles.copyLine} data-testid="signin-cert">
                {saml.cert ? (
                  <span className={saml.cert.status === "expired" ? styles.fail : saml.cert.status === "soon" ? styles.needsYou : undefined}>
                    {saml.cert.status === "expired"
                      ? t("settingsSignIn.certExpired", { date: day(saml.cert.expiresAt) })
                      : t(saml.cert.status === "soon" ? "settingsSignIn.certSoon" : "settingsSignIn.certOk", { date: day(saml.cert.expiresAt), n: certDays })}
                  </span>
                ) : t("settingsSignIn.certNone")}
                {saml.saved && saml.metadataUrl && !view.demo ? (
                  <button className={s.soft} type="button" disabled={pending} data-testid="signin-refresh" onClick={() => run("saml", () => refreshSamlMetadataAction(view.slug))}>{t("settingsSignIn.refreshMetadata")}</button>
                ) : null}
              </dd>
            </div>
          </dl>
          {!view.demo ? (
            <p className={styles.testRow}>
              <a className={s.soft} href={saml.testHref} target="_blank" rel="noopener">{t("settingsSignIn.testSignIn")}</a>
              {testLine(saml.test, true)}
            </p>
          ) : null}
          {note("saml")}
        </SectionCard>
      </div>

      <div data-testid="signin-scim">
        <SectionCard name="scim" title={t("settingsSignIn.scimTitle")}>
          {statusRow(scim.state, !view.demo ? switcher("scim", scim.on, (on) => run("scim", () => setScimOnAction(view.slug, on)), !scim.tokenCreatedAt) : null)}
          {demoLine}
          <dl className={`${s.well} ${styles.facts}`}>
            {url(t("settingsSignIn.scimEndpoint"), scim.endpoint)}
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.scimToken")}</dt>
              <dd className={styles.copyLine}>
                {scim.tokenCreatedAt ? t("settingsSignIn.scimTokenSet", { date: day(scim.tokenCreatedAt) }) : t("settingsSignIn.scimTokenNone")}
                {!view.demo ? (
                  <button className={s.soft} type="button" disabled={pending} data-testid="signin-token" onClick={() => (scim.tokenCreatedAt ? setAsk("token") : newToken())}>
                    {scim.tokenCreatedAt ? t("settingsSignIn.scimReplaceToken") : t("settingsSignIn.scimCreateToken")}
                  </button>
                ) : null}
              </dd>
            </div>
            <div className={s.wellRow}><dt>{t("settingsSignIn.scimLastRequest")}</dt><dd>{scim.lastRequestAt ? stamp(scim.lastRequestAt) : t("settingsSignIn.scimNever")}</dd></div>
            <div className={s.wellRow}><dt>{t("settingsSignIn.scimLast7")}</dt><dd>{t("settingsSignIn.scimCounts", { a: scim.activity.added, b: scim.activity.updated, c: scim.activity.deactivated })}</dd></div>
          </dl>
          {token ? (
            <div data-testid="signin-secret">
              <h3 className={s.subLabel}>{t("settingsSignIn.scimNewToken")}</h3>
              <SecretOnce value={token} note={t("settingsSignIn.scimShownOnce")} copyLabel={t("settingsSignIn.copy")} copiedLabel={t("settingsSignIn.copied")} testId="signin-secret-value" />
              <p className={styles.testRow}>
                <button className={s.soft} type="button" onClick={() => setToken(null)}>{t("settingsSignIn.scimDone")}</button>
              </p>
            </div>
          ) : null}
          {note("scim")}
        </SectionCard>
      </div>

      <div data-testid="signin-logsink">
        <SectionCard name="logsink" title={t("settingsSignIn.exportTitle")}>
          {statusRow(logsink.state, switcher("logsink", logsink.on, (on) => run("logsink", () => setLogExportOnAction(view.slug, on)), logsink.target === "off"))}
          <form className={styles.form} onSubmit={(e) => { const f = fields(e); run("logsink", () => saveLogExportAction(view.slug, { ...f, target })); }}>
            <fieldset disabled={pending} className={styles.form}>
              <Row label={t("settingsSignIn.exportSendTo")}>
                <div className={styles.radios}>
                  {logsink.target === "off" ? <label className={styles.radio}><input type="radio" checked={target === "off"} onChange={() => setTarget("off")} />{t("settingsSignIn.exportOff")}</label> : null}
                  <label className={styles.radio}><input type="radio" checked={target === "syslog"} onChange={() => setTarget("syslog")} />{t("settingsSignIn.exportSyslog")}</label>
                  <label className={styles.radio}><input type="radio" checked={target === "file"} onChange={() => setTarget("file")} />{t("settingsSignIn.exportFile")}</label>
                </div>
              </Row>
              {target === "syslog" ? (
                <>
                  <Row id="log-host" label={t("settingsSignIn.exportHost")}><input id="log-host" className={s.input} name="host" defaultValue={logsink.host} required /></Row>
                  <Row id="log-port" label={t("settingsSignIn.exportPort")}><input id="log-port" className={s.input} data-size="money" name="port" inputMode="numeric" defaultValue={logsink.port} required /></Row>
                  <Row id="log-transport" label={t("settingsSignIn.exportTransport")}>
                    <select id="log-transport" className={s.input} name="transport" defaultValue={logsink.transport}>
                      <option value="tls">{t("settingsSignIn.transportTls")}</option>
                      <option value="tcp">{t("settingsSignIn.transportTcp")}</option>
                      <option value="udp">{t("settingsSignIn.transportUdp")}</option>
                    </select>
                  </Row>
                  <Row id="log-ca" label={t("settingsSignIn.exportCa")} top help={`${t("settingsSignIn.exportFormat")}: ${t("settingsSignIn.exportFormatSyslog")}`}>
                    <textarea id="log-ca" className={s.input} name="caPem" rows={3} defaultValue={logsink.caPem} />
                  </Row>
                </>
              ) : target === "file" ? (
                <Row label={t("settingsSignIn.exportFileName")} top help={t("settingsSignIn.exportFileText")}>
                  <span className={s.mono} data-testid="signin-file">{logsink.fileName}</span>
                </Row>
              ) : null}
              {target !== "off" ? <Foot><button className={s.save} type="submit" data-testid="signin-save-logsink">{t("settingsSignIn.save")}</button></Foot> : null}
            </fieldset>
          </form>
          {logsink.on ? (
            <p className={styles.testRow}>
              <button className={s.soft} type="button" disabled={pending} data-testid="signin-test-record"
                onClick={() => run("logsink", () => sendTestRecordAction(view.slug), (r) => setExportTest(r.test ? { ...r.test, at: new Date().toISOString() } : null), false)}>
                {t("settingsSignIn.exportTestButton")}
              </button>
              {exportTest ? (
                <span className={exportTest.ok ? styles.ok : styles.fail}>
                  {exportTest.ok ? t("settingsSignIn.exportTestOk", { at: stamp(exportTest.at) }) : t("settingsSignIn.exportTestFailed", { at: stamp(exportTest.at), detail: exportTest.detail })}
                </span>
              ) : testLine(logsink.test, false)}
            </p>
          ) : null}
          <dl className={`${s.well} ${styles.facts}`}>
            <div className={s.wellRow}>
              <dt>{t("settingsSignIn.exportLastSent")}</dt>
              <dd>{logsink.lastOkAt ? t("settingsSignIn.exportToday", { time: stamp(logsink.lastOkAt), n: logsink.sentToday }) : t("settingsSignIn.exportNever")}</dd>
            </div>
            {logsink.lastError ? <div className={s.wellRow}><dt>{t("settingsSignIn.exportError")}</dt><dd className={styles.fail}>{logsink.lastError}</dd></div> : null}
          </dl>
          {note("logsink")}
        </SectionCard>
      </div>

      {ask === "oidc" ? confirmBox("oidc", t("settingsSignIn.oidcTitle"), t("settingsSignIn.oidcOnAsk", { button: oidc.buttonText, company: view.company }), () => run("oidc", () => setOidcOnAction(view.slug, true))) : null}
      {ask === "saml" ? confirmBox("saml", t("settingsSignIn.samlTitle"), t("settingsSignIn.samlOnAsk", { button: saml.buttonText, company: view.company }), () => run("saml", () => setSamlOnAction(view.slug, true))) : null}
      {ask === "token" ? confirmBox("scim", t("settingsSignIn.scimReplaceToken"), t("settingsSignIn.scimReplaceAsk"), newToken) : null}
    </div>
  );
}
