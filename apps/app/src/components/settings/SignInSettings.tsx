"use client";
// Settings -> Sign-in and provisioning: six cards (personal codes, Entra, OIDC, SAML, SCIM, audit log export).
// Props in, JSX out: every change calls an action from server/actions/settings/sign-in.ts. The client secret
// and the new SCIM token are never kept after the box is closed.
import { useState, useTransition, type FormEvent } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import {
  refreshSamlMetadataAction, replaceScimTokenAction, saveLogExportAction, saveOidcAction, saveSamlAction,
  sendTestRecordAction, setLogExportOnAction, setOidcOnAction, setSamlOnAction, setScimOnAction, type SignInResult,
} from "@/server/actions/settings/sign-in";
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
      <p className={msg.error ? styles.fail : styles.okLine} role={msg.error ? "alert" : "status"} data-testid={`signin-msg-${card}`}>{msg.text}</p>
    ) : null;
  const badge = (s: State) => <span className={`${styles.badge} ${styles[s]}`} data-testid="signin-badge">{t(STATE_LABEL[s])}</span>;
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).catch(() => undefined); };
  const url = (label: string, v: string) => (
    <>
      <dt>{label}</dt>
      <dd><span className={styles.mono}>{v}</span> <button className="nh-btn" type="button" onClick={() => copy(v)}>{t("settingsSignIn.copy")}</button></dd>
    </>
  );
  const testLine = (v: TestView | null, sso: boolean) => {
    if (!v) return <span className="nh-hint">{t("settingsSignIn.testNone")}</span>;
    if (v.ok) return <span className={styles.okLine}>{sso && v.name ? t("settingsSignIn.testOkMatched", { name: v.name }) : t("settingsSignIn.testOk", { at: stamp(v.at) })}</span>;
    const key = SSO_CODE[v.detail];
    const text = key ? t(key, { company: view.company }) : v.detail;
    return <span className={styles.fail}>{t("settingsSignIn.testFailed", { at: stamp(v.at), detail: text })}</span>;
  };
  const switcher = (card: Card, on: boolean, change: (on: boolean) => void, disabled: boolean) => (
    <label className={styles.row}>
      <input type="checkbox" checked={on} disabled={pending || disabled} data-testid={`signin-switch-${card}`} onChange={(e) => change(e.currentTarget.checked)} />
      {on ? t("settingsSignIn.on") : t("settingsSignIn.off")}
    </label>
  );
  const demoLine = view.demo ? <p className="nh-hint" data-testid="signin-demo">{t("settingsSignIn.demo")}</p> : null;
  const confirmBox = (card: Card, text: string, go: () => void) => (
    <div className={styles.ask} role="alertdialog">
      <p>{text}</p>
      <div className={styles.row}>
        <button className="nh-btn nh-btn-primary" type="button" disabled={pending} data-testid={`signin-confirm-${card}`} onClick={() => { setAsk(null); go(); }}>{t("settingsSignIn.confirm")}</button>
        <button className="nh-btn" type="button" onClick={() => setAsk(null)}>{t("settingsSignIn.cancel")}</button>
      </div>
    </div>
  );
  const newToken = () => run("scim", () => replaceScimTokenAction(view.slug), (r) => setToken(r.token ?? null), false);

  const { oidc, saml, scim, logsink } = view;
  const certDays = saml.cert ? Math.abs(saml.cert.days) : 0;

  return (
    <div className={styles.wrap}>
      <section className={styles.card} data-testid="signin-codes">
        <div className={styles.head}><h2 className={styles.title}>{t("settingsSignIn.codesTitle")}</h2>{badge("on")}</div>
        <p className={styles.hint}>{t("settingsSignIn.codesText")}</p>
        <dl className={styles.grid}>
          <dt>{t("settingsSignIn.codesSecondFactor")}</dt>
          <dd>{t("settingsSignIn.codesCount", { n: view.codes.set, m: view.codes.managers })}</dd>
        </dl>
      </section>

      <section className={styles.card} data-testid="signin-entra">
        <div className={styles.head}><h2 className={styles.title}>{t("settingsSignIn.entraTitle")}</h2>{badge(view.entraTenantId ? "on" : "off")}</div>
        <dl className={styles.grid}>
          <dt>{t("settingsSignIn.entraTenant")}</dt>
          <dd><span className={styles.mono}>{view.entraTenantId ?? t("settingsSignIn.entraNone")}</span> · {t("settingsSignIn.entraConsole")}</dd>
        </dl>
        <p className={styles.hint}>{t("settingsSignIn.entraText")}</p>
      </section>

      <section className={styles.card} data-testid="signin-oidc">
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settingsSignIn.oidcTitle")}</h2>
          <span className={styles.row}>
            {badge(oidc.state)}
            {!view.demo ? switcher("oidc", oidc.on, (on) => (on ? setAsk("oidc") : run("oidc", () => setOidcOnAction(view.slug, false))), !oidc.saved) : null}
          </span>
        </div>
        {demoLine}
        {ask === "oidc" ? confirmBox("oidc", t("settingsSignIn.oidcOnAsk", { button: oidc.buttonText, company: view.company }), () => run("oidc", () => setOidcOnAction(view.slug, true))) : null}
        <form className={styles.fields} key={`oidc-${oidc.buttonText}-${oidc.issuer}`} onSubmit={(e) => { const f = fields(e); run("oidc", () => saveOidcAction(view.slug, f)); }}>
          <fieldset disabled={view.demo || pending} className={styles.fields}>
            <label>{t("settingsSignIn.buttonText")}<input className="nh-input" name="buttonText" maxLength={40} defaultValue={oidc.buttonText} required /></label>
            <label>{t("settingsSignIn.issuer")}<input className="nh-input" name="issuer" type="url" defaultValue={oidc.issuer} required /></label>
            <label>{t("settingsSignIn.clientId")}<input className="nh-input" name="clientId" defaultValue={oidc.clientId} required /></label>
            <label>
              {t("settingsSignIn.clientSecret")} · {oidc.hasSecret ? t("settingsSignIn.secretSet") : t("settingsSignIn.secretNotSet")}
              <input className="nh-input" name="clientSecret" type="password" autoComplete="new-password" />
              {oidc.hasSecret ? <span className="nh-hint">{t("settingsSignIn.secretKeep")}</span> : null}
            </label>
            <label>{t("settingsSignIn.scopes")}<input className="nh-input" name="scopes" defaultValue={oidc.scopes} /></label>
            <button className="nh-btn nh-btn-primary" type="submit" data-testid="signin-save-oidc">{t("settingsSignIn.save")}</button>
          </fieldset>
        </form>
        <dl className={styles.grid}>{url(t("settingsSignIn.redirectUrl"), oidc.redirectUrl)}</dl>
        {!view.demo ? (
          <p className={styles.row}>
            <a className="nh-btn" href={oidc.testHref} target="_blank" rel="noopener">{t("settingsSignIn.testSignIn")}</a>
            {testLine(oidc.test, true)}
          </p>
        ) : null}
        {note("oidc")}
      </section>

      <section className={styles.card} data-testid="signin-saml">
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settingsSignIn.samlTitle")}</h2>
          <span className={styles.row}>
            {badge(saml.state)}
            {!view.demo ? switcher("saml", saml.on, (on) => (on ? setAsk("saml") : run("saml", () => setSamlOnAction(view.slug, false))), !saml.saved) : null}
          </span>
        </div>
        {demoLine}
        {ask === "saml" ? confirmBox("saml", t("settingsSignIn.samlOnAsk", { button: saml.buttonText, company: view.company }), () => run("saml", () => setSamlOnAction(view.slug, true))) : null}
        <form className={styles.fields} key={`saml-${saml.buttonText}-${saml.metadataUrl}`} onSubmit={(e) => { const f = fields(e); run("saml", () => saveSamlAction(view.slug, { ...f, source: samlSource, metadataXml: samlXml })); }}>
          <fieldset disabled={view.demo || pending} className={styles.fields}>
            <label>{t("settingsSignIn.buttonText")}<input className="nh-input" name="buttonText" maxLength={40} defaultValue={saml.buttonText} required /></label>
            <fieldset className={styles.segments}>
              <legend>{t("settingsSignIn.idpMetadata")}</legend>
              {saml.saved ? <label className={styles.row}><input type="radio" checked={samlSource === "keep"} onChange={() => setSamlSource("keep")} />{t("settingsSignIn.metadataKeep")}</label> : null}
              <label className={styles.row}><input type="radio" checked={samlSource === "url"} onChange={() => setSamlSource("url")} />{t("settingsSignIn.metadataUrl")}</label>
              <label className={styles.row}><input type="radio" checked={samlSource === "file"} onChange={() => setSamlSource("file")} />{t("settingsSignIn.metadataFile")}</label>
            </fieldset>
            {samlSource === "url" ? <input className="nh-input" name="metadataUrl" type="url" aria-label={t("settingsSignIn.metadataUrl")} defaultValue={saml.metadataUrl} required /> : null}
            {samlSource === "file" ? (
              <input className="nh-input" type="file" accept=".xml,text/xml,application/xml" aria-label={t("settingsSignIn.metadataFile")}
                onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) void file.text().then(setSamlXml); }} />
            ) : null}
            <button className="nh-btn nh-btn-primary" type="submit" data-testid="signin-save-saml">{t("settingsSignIn.save")}</button>
          </fieldset>
        </form>
        <dl className={styles.grid}>
          {url(t("settingsSignIn.entityId"), saml.entityId)}
          {url(t("settingsSignIn.replyUrl"), saml.replyUrl)}
          <dt>{t("settingsSignIn.ourDetails")}</dt>
          <dd><a href={saml.metadataHref} download>{t("settingsSignIn.spMetadata")}</a></dd>
          <dt>{t("settingsSignIn.certificate")}</dt>
          <dd data-testid="signin-cert">
            {saml.cert ? (
              <span className={saml.cert.status === "expired" ? styles.fail : saml.cert.status === "soon" ? styles.needsYou : undefined}>
                {saml.cert.status === "expired"
                  ? t("settingsSignIn.certExpired", { date: day(saml.cert.expiresAt) })
                  : t(saml.cert.status === "soon" ? "settingsSignIn.certSoon" : "settingsSignIn.certOk", { date: day(saml.cert.expiresAt), n: certDays })}
              </span>
            ) : t("settingsSignIn.certNone")}
            {" "}
            {saml.saved && saml.metadataUrl && !view.demo ? (
              <button className="nh-btn" type="button" disabled={pending} data-testid="signin-refresh" onClick={() => run("saml", () => refreshSamlMetadataAction(view.slug))}>{t("settingsSignIn.refreshMetadata")}</button>
            ) : null}
          </dd>
        </dl>
        {!view.demo ? (
          <p className={styles.row}>
            <a className="nh-btn" href={saml.testHref} target="_blank" rel="noopener">{t("settingsSignIn.testSignIn")}</a>
            {testLine(saml.test, true)}
          </p>
        ) : null}
        {note("saml")}
      </section>

      <section className={styles.card} data-testid="signin-scim">
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settingsSignIn.scimTitle")}</h2>
          <span className={styles.row}>
            {badge(scim.state)}
            {!view.demo ? switcher("scim", scim.on, (on) => run("scim", () => setScimOnAction(view.slug, on)), !scim.tokenCreatedAt) : null}
          </span>
        </div>
        {demoLine}
        <dl className={styles.grid}>
          {url(t("settingsSignIn.scimEndpoint"), scim.endpoint)}
          <dt>{t("settingsSignIn.scimToken")}</dt>
          <dd>
            {scim.tokenCreatedAt ? t("settingsSignIn.scimTokenSet", { date: day(scim.tokenCreatedAt) }) : t("settingsSignIn.scimTokenNone")}{" "}
            {!view.demo ? (
              <button className="nh-btn" type="button" disabled={pending} data-testid="signin-token" onClick={() => (scim.tokenCreatedAt ? setAsk("token") : newToken())}>
                {scim.tokenCreatedAt ? t("settingsSignIn.scimReplaceToken") : t("settingsSignIn.scimCreateToken")}
              </button>
            ) : null}
          </dd>
          <dt>{t("settingsSignIn.scimLastRequest")}</dt>
          <dd>{scim.lastRequestAt ? stamp(scim.lastRequestAt) : t("settingsSignIn.scimNever")}</dd>
          <dt>{t("settingsSignIn.scimLast7")}</dt>
          <dd>{t("settingsSignIn.scimCounts", { a: scim.activity.added, b: scim.activity.updated, c: scim.activity.deactivated })}</dd>
        </dl>
        {ask === "token" ? confirmBox("scim", t("settingsSignIn.scimReplaceAsk"), newToken) : null}
        {token ? (
          <div className={styles.secret} data-testid="signin-secret">
            <strong>{t("settingsSignIn.scimNewToken")}</strong>
            <code className={styles.mono} data-testid="signin-secret-value">{token}</code>
            <p className="nh-hint">{t("settingsSignIn.scimShownOnce")}</p>
            <span className={styles.row}>
              <button className="nh-btn" type="button" onClick={() => copy(token)}>{t("settingsSignIn.copy")}</button>
              <button className="nh-btn" type="button" onClick={() => setToken(null)}>{t("settingsSignIn.scimDone")}</button>
            </span>
          </div>
        ) : null}
        {note("scim")}
      </section>

      <section className={styles.card} data-testid="signin-logsink">
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settingsSignIn.exportTitle")}</h2>
          <span className={styles.row}>
            {badge(logsink.state)}
            {switcher("logsink", logsink.on, (on) => run("logsink", () => setLogExportOnAction(view.slug, on)), logsink.target === "off")}
          </span>
        </div>
        <form className={styles.fields} onSubmit={(e) => { const f = fields(e); run("logsink", () => saveLogExportAction(view.slug, { ...f, target })); }}>
          <fieldset disabled={pending} className={styles.fields}>
            <fieldset className={styles.segments}>
              <legend>{t("settingsSignIn.exportSendTo")}</legend>
              {logsink.target === "off" ? <label className={styles.row}><input type="radio" checked={target === "off"} onChange={() => setTarget("off")} />{t("settingsSignIn.exportOff")}</label> : null}
              <label className={styles.row}><input type="radio" checked={target === "syslog"} onChange={() => setTarget("syslog")} />{t("settingsSignIn.exportSyslog")}</label>
              <label className={styles.row}><input type="radio" checked={target === "file"} onChange={() => setTarget("file")} />{t("settingsSignIn.exportFile")}</label>
            </fieldset>
            {target === "syslog" ? (
              <>
                <label>{t("settingsSignIn.exportHost")}<input className="nh-input" name="host" defaultValue={logsink.host} required /></label>
                <label>{t("settingsSignIn.exportPort")}<input className="nh-input" name="port" inputMode="numeric" defaultValue={logsink.port} required /></label>
                <label>
                  {t("settingsSignIn.exportTransport")}
                  <select className="nh-input" name="transport" defaultValue={logsink.transport}>
                    <option value="tls">{t("settingsSignIn.transportTls")}</option>
                    <option value="tcp">{t("settingsSignIn.transportTcp")}</option>
                    <option value="udp">{t("settingsSignIn.transportUdp")}</option>
                  </select>
                </label>
                <label>{t("settingsSignIn.exportCa")}<textarea className="nh-input" name="caPem" rows={3} defaultValue={logsink.caPem} /></label>
                <p className="nh-hint">{t("settingsSignIn.exportFormat")}: {t("settingsSignIn.exportFormatSyslog")}</p>
              </>
            ) : target === "file" ? (
              <>
                <p>{t("settingsSignIn.exportFileName")}: <span className={styles.mono} data-testid="signin-file">{logsink.fileName}</span></p>
                <p className="nh-hint">{t("settingsSignIn.exportFileText")}</p>
              </>
            ) : null}
            {target !== "off" ? <button className="nh-btn nh-btn-primary" type="submit" data-testid="signin-save-logsink">{t("settingsSignIn.save")}</button> : null}
          </fieldset>
        </form>
        {logsink.on ? (
          <p className={styles.row}>
            <button className="nh-btn" type="button" disabled={pending} data-testid="signin-test-record"
              onClick={() => run("logsink", () => sendTestRecordAction(view.slug), (r) => setExportTest(r.test ? { ...r.test, at: new Date().toISOString() } : null), false)}>
              {t("settingsSignIn.exportTestButton")}
            </button>
            {exportTest ? (
              <span className={exportTest.ok ? styles.okLine : styles.fail}>
                {exportTest.ok ? t("settingsSignIn.exportTestOk", { at: stamp(exportTest.at) }) : t("settingsSignIn.exportTestFailed", { at: stamp(exportTest.at), detail: exportTest.detail })}
              </span>
            ) : testLine(logsink.test, false)}
          </p>
        ) : null}
        <dl className={styles.grid}>
          <dt>{t("settingsSignIn.exportLastSent")}</dt>
          <dd>{logsink.lastOkAt ? t("settingsSignIn.exportToday", { time: stamp(logsink.lastOkAt), n: logsink.sentToday }) : t("settingsSignIn.exportNever")}</dd>
          {logsink.lastError ? <><dt>{t("settingsSignIn.exportError")}</dt><dd className={styles.fail}>{logsink.lastError}</dd></> : null}
        </dl>
        {note("logsink")}
      </section>
    </div>
  );
}
