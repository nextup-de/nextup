"use client";
// Console connectors: the AI provider. The key is typed here and never comes back; only "set" shows.
import { useState, useTransition } from "react";
import { Field } from "@/components/ui/Field";
import { useT } from "@/i18n/client";
import { saveConsoleAi, type ConsoleConnectorState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import type { AiBlockView } from "./views";
import styles from "@/app/admin/admin.module.css";

export function AiBlock({ view, readOnly }: { view: AiBlockView; readOnly: boolean }) {
  const t = useT();
  const [f, setF] = useState({ choice: view.choice === "mock" ? "off" : view.choice, region: view.region, endpoint: view.endpoint, model: view.model, deployment: view.deployment, key: "" });
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const azure = f.choice === "azure-openai";
  const hosted = azure || f.choice === "openai-compatible";
  return (
    <section className={styles.card} data-testid="console-connectors-ai">
      <h2>{t("adminConnectors.aiTitle")}</h2>
      {view.choice === "mock" ? <p className="nh-hint">{t("adminConnectors.aiMock")}</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody><tr><th>{t("adminConnectors.aiKeyState")}</th><td data-testid="console-connectors-ai-key">{t(view.key === "set" ? "adminConnectors.set" : "adminConnectors.notSet")}</td></tr></tbody>
        </table>
      </div>
      {!view.vault ? <p className={styles.warn}>{t("adminConnectors.errNoVault")}</p> : null}
      <div className={styles.grid}>
        <Field id="ca-choice" label={t("adminConnectors.aiProvider")}>
          <select className="nh-input" id="ca-choice" data-testid="console-connectors-ai-choice" value={f.choice} disabled={readOnly} onChange={(e) => set("choice", e.target.value)}>
            <option value="off">{t("adminConnectors.aiOff")}</option>
            <option value="bedrock">{t("adminConnectors.aiBedrock")}</option>
            <option value="azure-openai">{t("adminConnectors.aiAzure")}</option>
            <option value="openai-compatible">{t("adminConnectors.aiCompatible")}</option>
          </select>
        </Field>
        <Field id="ca-region" label={t("adminConnectors.aiRegion")}>
          <input className="nh-input" id="ca-region" value={f.region} disabled={readOnly} onChange={(e) => set("region", e.target.value)} />
        </Field>
        {hosted ? (
          <Field id="ca-endpoint" label={t("adminConnectors.aiEndpoint")}>
            <input className="nh-input" id="ca-endpoint" value={f.endpoint} disabled={readOnly} onChange={(e) => set("endpoint", e.target.value)} autoComplete="off" />
          </Field>
        ) : null}
        <Field id="ca-model" label={t("adminConnectors.aiModel")}>
          <input className="nh-input" id="ca-model" value={f.model} disabled={readOnly} onChange={(e) => set("model", e.target.value)} />
        </Field>
        {azure ? (
          <Field id="ca-deployment" label={t("adminConnectors.aiDeployment")}>
            <input className="nh-input" id="ca-deployment" value={f.deployment} disabled={readOnly} onChange={(e) => set("deployment", e.target.value)} />
          </Field>
        ) : null}
        {hosted ? (
          <Field id="ca-key" label={t("adminConnectors.aiKey")} hint={t("adminConnectors.aiKeyHint")}>
            <input className="nh-input" id="ca-key" type="password" value={f.key} disabled={readOnly} onChange={(e) => set("key", e.target.value)} autoComplete="new-password" />
          </Field>
        ) : null}
      </div>
      {note && !note.ok ? <p className={styles.error} role="alert">{t(CODE_KEY[note.code])}{note.detail ? ` (${note.detail})` : ""}</p> : null}
      {note?.ok ? <p className="nh-hint" role="status">{t("adminConnectors.saved")}</p> : null}
      <div className={styles.jiraActions}>
        <button type="button" className="nh-btn nh-btn-primary" data-testid="console-connectors-ai-save" disabled={pending || readOnly}
          onClick={() => { setNote(null); start(async () => { const r = await saveConsoleAi(f); if (r.ok) set("key", ""); setNote(r); }); }}>
          {pending ? t("adminConnectors.working") : t("adminConnectors.save")}
        </button>
      </div>
    </section>
  );
}
