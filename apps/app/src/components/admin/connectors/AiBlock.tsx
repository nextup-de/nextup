"use client";
// Console connectors: the AI provider. The key is typed here and never comes back; only "set" shows.
import { useState, useTransition } from "react";
import { DEFAULT_ANTHROPIC_MODEL } from "@/features/ai/settings";
import { aiStatus } from "@/features/connectors/status";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { saveConsoleAi, type ConsoleConnectorState } from "@/server/actions/console-connectors";
import { CODE_KEY } from "./codes";
import { ConnectorCard, Row, STATUS_KEY, type Note } from "./ConnectorCard";
import type { AiBlockView } from "./views";
import c from "./Connectors.module.css";

const SparkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
);

const CHOICES: { value: string; label: MessageKey }[] = [
  { value: "bedrock", label: "adminConnectors.aiBedrock" },
  { value: "azure-openai", label: "adminConnectors.aiAzure" },
  { value: "openai-compatible", label: "adminConnectors.aiCompatible" },
  { value: "anthropic", label: "adminConnectors.aiAnthropic" },
  { value: "local", label: "adminConnectors.aiLocal" },
  { value: "off", label: "adminConnectors.aiOffChoice" },
];

export function AiBlock({ view, readOnly }: { view: AiBlockView; readOnly: boolean }) {
  const t = useT();
  const [f, setF] = useState({ choice: view.choice === "mock" ? "off" : view.choice, region: view.region, endpoint: view.endpoint, model: view.model, deployment: view.deployment, brainModel: view.brainModel, prices: view.prices, key: "" });
  const [note, setNote] = useState<ConsoleConnectorState | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const azure = f.choice === "azure-openai";
  const hosted = azure || f.choice === "openai-compatible";
  // The model on this stack: no region, endpoint, model or key; the brain of this stack answers (Q8.4).
  const local = f.choice === "local";
  // Claude through Anthropic's own API: a key and a model, no region or endpoint; demo companies only (gate.ts).
  const claudeApi = f.choice === "anthropic";
  const status = aiStatus(view);
  const notes: Note[] = [];
  if (view.choice === "mock") notes.push({ tone: "plain", text: t("adminConnectors.aiMock") });
  if (local && view.brain === "none") notes.push({ tone: "warn", text: t("adminConnectors.aiLocalNoBrain") });
  else if (local && view.choice === "local" && view.brain === "down") notes.push({ tone: "warn", text: t("adminConnectors.aiLocalDown") });
  else if (local) notes.push({ tone: "plain", text: t("adminConnectors.aiLocalLine") });
  if (claudeApi) notes.push({ tone: "warn", text: t("adminConnectors.aiAnthropicLine") });
  if (status === "needs" && view.choice !== "local") notes.push({ tone: "warn", text: view.vault ? t("adminConnectors.aiNeedsKey") : t("adminConnectors.errNoVault") });
  if (status === "off" && view.choice !== "mock") notes.push({ tone: "plain", text: t("adminConnectors.aiOffLine") });
  return (
    <ConnectorCard
      id="ai" testId="console-connectors-ai" icon={<SparkIcon />} title={t("adminConnectors.aiTitle")}
      status={status} statusLabel={t(STATUS_KEY[status])} lede={t("adminConnectors.aiLede")} notes={notes}
      factsTitle={t("adminConnectors.readsTitle")}
      facts={[
        { label: t("adminConnectors.factSends"), value: view.choice === "local" ? t("adminConnectors.aiLocalSends") : t("adminConnectors.aiSends") },
        { label: t("adminConnectors.factNeverSends"), value: t("adminConnectors.aiNeverSends") },
        { label: t("adminConnectors.aiKeyState"), value: <span data-testid="console-connectors-ai-key">{t(view.key === "set" ? "adminConnectors.set" : "adminConnectors.notSet")}</span> },
      ]}>
      <div className={c.fields}>
        <h3 className={c.sub}>{t("adminConnectors.aiProvider")}</h3>
        <div className={c.radios} role="radiogroup" aria-label={t("adminConnectors.aiProvider")} data-testid="console-connectors-ai-choice">
          {CHOICES.map((x) => (
            <label key={x.value} className={c.radio}>
              <input type="radio" name="ai-choice" value={x.value} checked={f.choice === x.value} disabled={readOnly} onChange={() => set("choice", x.value)} />
              {t(x.label)}
            </label>
          ))}
        </div>
        {f.choice === "off" || local ? null : (
          <>
            {claudeApi ? null : (
              <Row id="ca-region" label={t("adminConnectors.aiRegion")}>
                <input className={c.input} id="ca-region" value={f.region} disabled={readOnly} onChange={(e) => set("region", e.target.value)} />
              </Row>
            )}
            {hosted ? (
              <Row id="ca-endpoint" label={t("adminConnectors.aiEndpoint")}>
                <input className={c.input} id="ca-endpoint" value={f.endpoint} disabled={readOnly} onChange={(e) => set("endpoint", e.target.value)} autoComplete="off" />
              </Row>
            ) : null}
            <Row id="ca-model" label={t("adminConnectors.aiModel")} hint={t("adminConnectors.aiModelHint")}>
              <input className={`${c.input} ${c.mono}`} id="ca-model" value={f.model} disabled={readOnly} placeholder={claudeApi ? DEFAULT_ANTHROPIC_MODEL : undefined} onChange={(e) => set("model", e.target.value)} />
            </Row>
            <Row id="ca-brain-model" label={t("adminConnectors.aiBrainModel")} hint={t("adminConnectors.aiBrainModelHint")}>
              <input className={`${c.input} ${c.mono}`} id="ca-brain-model" value={f.brainModel} maxLength={120} disabled={readOnly} onChange={(e) => set("brainModel", e.target.value)} autoComplete="off" />
            </Row>
            {azure ? (
              <Row id="ca-deployment" label={t("adminConnectors.aiDeployment")}>
                <input className={c.input} id="ca-deployment" value={f.deployment} disabled={readOnly} onChange={(e) => set("deployment", e.target.value)} />
              </Row>
            ) : null}
            {hosted || claudeApi ? (
              <Row id="ca-key" label={t("adminConnectors.aiKey")} hint={t("adminConnectors.aiKeyHint")}>
                <input className={c.input} id="ca-key" type="password" value={f.key} disabled={readOnly} onChange={(e) => set("key", e.target.value)} autoComplete="new-password" />
              </Row>
            ) : null}
          </>
        )}
        {/* Also with the AI off: in the demo stage the brain still answers with its own model, which may need a price
            and is capped (features/ai/gate.ts). */}
        <Row id="ca-prices" label={t("adminConnectors.aiPrices")} hint={t("adminConnectors.aiPricesHint")}>
          <textarea className={`${c.input} ${c.mono} ${c.area}`} id="ca-prices" rows={3} value={f.prices} disabled={readOnly} spellCheck={false}
            placeholder="gpt-4.1-mini 0.42 1.68" onChange={(e) => set("prices", e.target.value)} data-testid="console-connectors-ai-prices" />
          {view.unpriced.length ? (
            <span className={c.hint} data-testid="console-connectors-ai-unpriced">{t("adminConnectors.aiPricesUnpriced", { models: view.unpriced.join(", ") })}</span>
          ) : null}
        </Row>
      </div>
      <div className={c.foot}>
        {note && !note.ok ? <p className={c.status} data-tone="error" role="alert">{t(CODE_KEY[note.code])}{note.detail ? ` (${note.detail})` : ""}</p> : null}
        {note?.ok ? <p className={c.status} role="status">{t("adminConnectors.saved")}</p> : null}
        <button type="button" className={c.primary} data-testid="console-connectors-ai-save" disabled={pending || readOnly}
          onClick={() => { setNote(null); start(async () => { const r = await saveConsoleAi(f); if (r.ok) set("key", ""); setNote(r); }); }}>
          {pending ? t("adminConnectors.working") : t("adminConnectors.save")}
        </button>
      </div>
    </ConnectorCard>
  );
}
