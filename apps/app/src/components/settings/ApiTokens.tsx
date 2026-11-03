"use client";
// Settings -> API tokens: the list, a drawer to create one, the shown-once box and revoke with a confirm step.
// Every change calls an action from server/actions/settings/api-tokens.ts.
import { useState, useTransition, type FormEvent } from "react";
import { DEFAULT_EXPIRY, EXPIRY_CHOICES, TOKEN_NAME_MAX } from "@/features/api/token-form";
import { OLD_SCOPES, V1_SCOPES } from "@/features/integrations";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { createTokenAction, revokeTokenAction } from "@/server/actions/settings/api-tokens";
import styles from "./ApiTokens.module.css";

export type TokenView = {
  id: string;
  name: string;
  scopes: string[];
  old: boolean;
  /** ISO dates. */
  createdAt: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  expired: boolean;
};
type Props = { slug: string; baseUrl: string; tokens: TokenView[] };

const day = (iso: string) => iso.slice(0, 10);

export function ApiTokens({ slug, baseUrl, tokens }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = { name: String(f.get("name") ?? ""), scopes: f.getAll("scopes").map(String), expiry: String(f.get("expiry") ?? "") };
    start(async () => {
      const r = await createTokenAction(slug, input);
      if (r.ok) {
        setError(null);
        setOpen(false);
        setShown(r.token);
      } else setError(r.error);
    });
  };
  const revoke = (id: string) =>
    start(async () => {
      const r = await revokeTokenAction(slug, id);
      setError(r.ok ? null : r.error);
      if (r.ok) setConfirming(null);
    });

  return (
    <section className={styles.wrap} data-testid="settings-api-tokens">
      <div className={styles.head}>
        <div>
          <p className="nh-hint">{t("settingsApiTokens.hint")}</p>
          <p className="nh-hint">{t("settingsApiTokens.baseUrl")}: <span className={styles.mono}>{baseUrl}</span></p>
          <p className="nh-hint">{t("settingsApiTokens.header")}</p>
        </div>
        <button className="nh-btn nh-btn-primary nh-btn-sm" type="button" data-testid="settings-api-tokens-add"
          onClick={() => { setError(null); setOpen(true); }}>{t("settingsApiTokens.create")}</button>
      </div>
      {error && !open ? <p className="nh-error" role="alert" data-testid="settings-api-tokens-error">{t(error)}</p> : null}

      {shown ? (
        <div className={styles.shown} role="status" data-testid="settings-api-tokens-shown">
          <strong>{t("settingsApiTokens.shownTitle")}</strong>
          <code className={styles.mono} data-testid="settings-api-tokens-secret">{shown}</code>
          <span className="nh-hint">{t("settingsApiTokens.shownHint")}</span>
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-sm" type="button" onClick={() => setShown(null)} data-testid="settings-api-tokens-shown-done">{t("settingsApiTokens.shownDone")}</button>
          </span>
        </div>
      ) : null}

      {tokens.length === 0 ? <p className="nh-hint" data-testid="settings-api-tokens-empty">{t("settingsApiTokens.empty")}</p> : null}
      <ul className={styles.list}>
        {tokens.map((k) => (
          <li key={k.id} className={styles.row} data-testid={`settings-api-tokens-row-${k.id}`}>
            <div className={styles.rowHead}>
              <strong>{k.name}</strong>
              {!k.revokedAt ? (
                confirming === k.id ? (
                  <span className={styles.buttons}>
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-api-tokens-revoke-yes" onClick={() => revoke(k.id)}>{t("settingsApiTokens.revokeYes")}</button>
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setConfirming(null)}>{t("settingsApiTokens.cancel")}</button>
                  </span>
                ) : (
                  <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-api-tokens-revoke" onClick={() => setConfirming(k.id)}>{t("settingsApiTokens.revoke")}</button>
                )
              ) : null}
            </div>
            <span className={styles.chips}>
              {k.scopes.map((s) => <span key={s} className={styles.chip}>{s}</span>)}
              {k.old ? <span className={styles.chip} data-testid="settings-api-tokens-old">{t("settingsApiTokens.oldChip")}</span> : null}
            </span>
            <span className="nh-hint">
              {[
                `${t("settingsApiTokens.createdOn")} ${day(k.createdAt)}${k.createdByName ? ` ${t("settingsApiTokens.createdBy")} ${k.createdByName}` : ""}`,
                `${t("settingsApiTokens.lastUsed")}: ${k.lastUsedAt ? day(k.lastUsedAt) : t("settingsApiTokens.never")}`,
                `${t("settingsApiTokens.expires")}: ${k.expiresAt ? day(k.expiresAt) : t("settingsApiTokens.never")}`,
                k.revokedAt ? t("settingsApiTokens.revoked") : k.expired ? t("settingsApiTokens.expired") : "",
              ].filter(Boolean).join(" · ")}
            </span>
            {confirming === k.id ? <span className="nh-hint" role="alert">{t("settingsApiTokens.revokeConfirm")}</span> : null}
          </li>
        ))}
      </ul>

      {open ? (
        <form className={styles.drawer} role="dialog" aria-label={t("settingsApiTokens.drawerTitle")} onSubmit={submit} data-testid="settings-api-tokens-drawer">
          <h3 className={styles.title}>{t("settingsApiTokens.drawerTitle")}</h3>
          <label className="nh-field"><span className="nh-label">{t("settingsApiTokens.fieldName")}</span>
            <input className="nh-input" name="name" required maxLength={TOKEN_NAME_MAX} data-testid="settings-api-tokens-field-name" /></label>
          <fieldset className={styles.fieldset}>
            <legend className="nh-label">{t("settingsApiTokens.fieldScopes")}</legend>
            <span className="nh-hint">{t("settingsApiTokens.scopesV1")}</span>
            {V1_SCOPES.map((s) => <label key={s}><input type="checkbox" name="scopes" value={s} data-testid={`settings-api-tokens-scope-${s}`} /> <span className={styles.mono}>{s}</span></label>)}
            <span className="nh-hint">{t("settingsApiTokens.scopesOld")}</span>
            {OLD_SCOPES.map((s) => <label key={s}><input type="checkbox" name="scopes" value={s} data-testid={`settings-api-tokens-scope-${s}`} /> <span className={styles.mono}>{s}</span></label>)}
          </fieldset>
          <label className="nh-field"><span className="nh-label">{t("settingsApiTokens.fieldExpiry")}</span>
            <select className="nh-select" name="expiry" defaultValue={DEFAULT_EXPIRY} data-testid="settings-api-tokens-field-expiry">
              {EXPIRY_CHOICES.map((c) => <option key={c} value={c}>{t(`settingsApiTokens.expiry${c === "never" ? "Never" : c}` as MessageKey)}</option>)}
            </select></label>
          {error ? <p className="nh-error" role="alert" data-testid="settings-api-tokens-error">{t(error)}</p> : null}
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-api-tokens-save">{t("settingsApiTokens.submit")}</button>
            <button className="nh-btn nh-btn-ghost" type="button" onClick={() => setOpen(false)} data-testid="settings-api-tokens-cancel">{t("settingsApiTokens.cancel")}</button>
          </span>
        </form>
      ) : null}
    </section>
  );
}
