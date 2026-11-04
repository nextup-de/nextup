"use client";
// Settings -> API tokens: the list, a drawer to create one, the shown-once box and revoke with a confirm step.
// Every change calls an action from server/actions/settings/api-tokens.ts.
import { useState, useTransition, type FormEvent } from "react";
import { Banner, ConfirmDialog, DataTable, EditDrawer, PersonFace, SecretOnce, SectionCard } from "@/components/ui/elements";
import { DEFAULT_EXPIRY, EXPIRY_CHOICES, TOKEN_NAME_MAX } from "@/features/api/token-form";
import { OLD_SCOPES, V1_SCOPES } from "@/features/integrations";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { createTokenAction, revokeTokenAction } from "@/server/actions/settings/api-tokens";
import { Foot } from "./SettingsParts";
import s from "./settings.module.css";
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
const FORM = "api-token-form";

export function ApiTokens({ slug, baseUrl, tokens }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<TokenView | null>(null);
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
      setConfirming(null);
    });

  return (
    <div className={s.page} data-testid="settings-api-tokens">
      <SectionCard name="connect">
        <dl className={s.well}>
          <div className={s.wellRow}><dt>{t("settingsApiTokens.baseUrl")}</dt><dd className={s.mono}>{baseUrl}</dd></div>
        </dl>
        <p className={s.cardHint}>{t("settingsApiTokens.header")}</p>
        <Foot>
          <button className={s.save} type="button" data-testid="settings-api-tokens-add" onClick={() => { setError(null); setOpen(true); }}>{t("settingsApiTokens.create")}</button>
        </Foot>
      </SectionCard>
      {error && !open ? <div data-testid="settings-api-tokens-error"><Banner tone="error">{t(error)}</Banner></div> : null}

      {shown ? (
        <div role="status" data-testid="settings-api-tokens-shown">
          <SectionCard name="shown" title={t("settingsApiTokens.shownTitle")}>
            <SecretOnce value={shown} note={t("settingsApiTokens.shownHint")} copyLabel={t("settingsApiTokens.copy")} copiedLabel={t("settingsApiTokens.copied")} testId="settings-api-tokens-secret" />
            <div className={styles.actions}>
              <button className={s.soft} type="button" onClick={() => setShown(null)} data-testid="settings-api-tokens-shown-done">{t("settingsApiTokens.shownDone")}</button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      <SectionCard name="tokens">
        {tokens.length === 0 ? (
          <p className={s.empty} data-testid="settings-api-tokens-empty">{t("settingsApiTokens.empty")}</p>
        ) : (
          <DataTable
            rows={tokens}
            rowKey={(k) => k.id}
            empty={t("settingsApiTokens.empty")}
            columns={[
              {
                key: "name", header: t("settingsApiTokens.fieldName"), width: "minmax(0, 1.4fr)",
                render: (k) => (
                  <span className={styles.name} data-testid={`settings-api-tokens-row-${k.id}`}>
                    <strong>{k.name}</strong>
                    <span className={styles.meta}>
                      {`${t("settingsApiTokens.createdOn")} ${day(k.createdAt)}`}
                      {k.createdByName ? <> {t("settingsApiTokens.createdBy")} <span className={styles.person}><PersonFace name={k.createdByName} size="sm" />{k.createdByName}</span></> : null}
                    </span>
                  </span>
                ),
              },
              {
                key: "scopes", header: t("settingsApiTokens.fieldScopes"), width: "minmax(0, 1.6fr)",
                render: (k) => (
                  <span className={styles.chips}>
                    {k.scopes.map((x) => <span key={x} className={styles.chip}>{x}</span>)}
                    {k.old ? <span className={styles.chip} data-testid="settings-api-tokens-old">{t("settingsApiTokens.oldChip")}</span> : null}
                  </span>
                ),
              },
              { key: "used", header: t("settingsApiTokens.lastUsed"), render: (k) => (k.lastUsedAt ? day(k.lastUsedAt) : t("settingsApiTokens.never")) },
              {
                key: "expires", header: t("settingsApiTokens.expires"),
                render: (k) => (
                  <span>
                    {k.expiresAt ? day(k.expiresAt) : t("settingsApiTokens.never")}
                    {k.revokedAt ? <span className={styles.state} data-state="revoked">{t("settingsApiTokens.revoked")}</span> : k.expired ? <span className={styles.state} data-state="expired">{t("settingsApiTokens.expired")}</span> : null}
                  </span>
                ),
              },
              {
                key: "actions", header: "", width: "auto",
                render: (k) => (k.revokedAt ? null : (
                  <button className={s.ghostDanger} type="button" disabled={pending} data-testid="settings-api-tokens-revoke" onClick={() => setConfirming(k)}>{t("settingsApiTokens.revoke")}</button>
                )),
              },
            ]}
          />
        )}
      </SectionCard>

      {open ? (
        <EditDrawer
          title={t("settingsApiTokens.drawerTitle")}
          closeLabel={t("settingsApiTokens.cancel")}
          onClose={() => setOpen(false)}
          testId="settings-api-tokens-drawer"
          foot={
            <>
              <button className={s.soft} type="button" onClick={() => setOpen(false)} data-testid="settings-api-tokens-cancel">{t("settingsApiTokens.cancel")}</button>
              <button className={s.save} type="submit" form={FORM} disabled={pending} data-testid="settings-api-tokens-save">{t("settingsApiTokens.submit")}</button>
            </>
          }
        >
          <form id={FORM} className={styles.form} onSubmit={submit}>
            <label className={s.field}><span className={s.label}>{t("settingsApiTokens.fieldName")}</span>
              <input className={s.input} name="name" required maxLength={TOKEN_NAME_MAX} autoComplete="off" data-testid="settings-api-tokens-field-name" /></label>
            <fieldset className={styles.fieldset}>
              <legend className={s.label}>{t("settingsApiTokens.fieldScopes")}</legend>
              <span className={s.help}>{t("settingsApiTokens.scopesV1")}</span>
              {V1_SCOPES.map((x) => <label key={x} className={styles.check}><input type="checkbox" name="scopes" value={x} data-testid={`settings-api-tokens-scope-${x}`} /> <span className={s.mono}>{x}</span></label>)}
              <span className={s.help}>{t("settingsApiTokens.scopesOld")}</span>
              {OLD_SCOPES.map((x) => <label key={x} className={styles.check}><input type="checkbox" name="scopes" value={x} data-testid={`settings-api-tokens-scope-${x}`} /> <span className={s.mono}>{x}</span></label>)}
            </fieldset>
            <label className={s.field}><span className={s.label}>{t("settingsApiTokens.fieldExpiry")}</span>
              <select className={s.input} name="expiry" defaultValue={DEFAULT_EXPIRY} data-testid="settings-api-tokens-field-expiry">
                {EXPIRY_CHOICES.map((c) => <option key={c} value={c}>{t(`settingsApiTokens.expiry${c === "never" ? "Never" : c}` as MessageKey)}</option>)}
              </select></label>
            {error ? <p className={s.fieldError} role="alert" data-testid="settings-api-tokens-error">{t(error)}</p> : null}
          </form>
        </EditDrawer>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={`${t("settingsApiTokens.revoke")}: ${confirming.name}`}
          text={t("settingsApiTokens.revokeConfirm")}
          confirmLabel={t("settingsApiTokens.revokeYes")}
          cancelLabel={t("settingsApiTokens.cancel")}
          danger
          onConfirm={() => revoke(confirming.id)}
          onCancel={() => setConfirming(null)}
          testId="settings-api-tokens-revoke-dialog"
        />
      ) : null}
    </div>
  );
}
