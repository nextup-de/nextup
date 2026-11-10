"use client";
// The assistant's switches on /admin/assistant. Client only for useActionState's saved/error line.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { LEVEL_LABEL, type Level } from "@/features/assist/classify";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { saveAssistSettingsAction, type AssistSettingsState } from "@/server/actions/assist-admin";
import c from "@/app/admin/people/console.module.css";

type Props = {
  enabled: boolean;
  ceiling: Level;
  retentionDays: number;
  dpaSignedAt: string; // YYYY-MM-DD or ""
  rules: string;
  patterns: string[];
  /** The month's budget for model calls in whole euros. */
  monthlyCapEur: number;
  /** Tokens per month of models without a price. */
  monthlyTokenCap: number;
  /** Where retention is set: Settings → Data and privacy. */
  privacyHref?: string;
};

const ERR = {
  "not-allowed": "adminPrivacy.errNotAllowed",
  "support-read-only": "adminPrivacy.errSupportReadOnly",
  "no-database": "adminPrivacy.errNoDatabase",
  invalid: "adminPrivacy.errInvalid",
} as const satisfies Record<Exclude<NonNullable<AssistSettingsState["code"]>, "bad-pattern">, MessageKey>;

const CEILINGS: Level[] = ["public", "internal", "confidential"];

export function AssistSettingsForm(p: Props) {
  const t = useT();
  const [state, act, pending] = useActionState<AssistSettingsState, FormData>(saveAssistSettingsAction, {});
  return (
    <form action={act} className={c.form}>
      <Field id="assistant" label={t("adminPrivacy.fieldAssistant")} hint={t("adminPrivacy.fieldAssistantHint")}>
        <select className="nh-input" id="assistant" name="assistant" defaultValue={p.enabled ? "on" : "off"}>
          <option value="off">{t("adminPrivacy.off")}</option>
          <option value="on">{t("adminPrivacy.on")}</option>
        </select>
      </Field>
      <Field id="ceiling" label={t("adminPrivacy.fieldCeiling")} hint={t("adminPrivacy.fieldCeilingHint")}>
        <select className="nh-input" id="ceiling" name="ceiling" defaultValue={p.ceiling}>
          {CEILINGS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
      </Field>
      <Field id="dpaSignedAt" label={t("adminPrivacy.fieldDpa")} hint={t("adminPrivacy.fieldDpaHint")}>
        <input className="nh-input" id="dpaSignedAt" name="dpaSignedAt" type="date" defaultValue={p.dpaSignedAt} />
      </Field>
      <Field id="retentionDays" label={t("adminPrivacy.fieldRetention")}>
        <p className={c.note} data-testid="console-assistant-retention">
          {t("settingsPrivacy.retentionFixed", { n: p.retentionDays })}
          {p.privacyHref ? <>{" "}<a href={p.privacyHref} data-testid="console-assistant-retention-link">{t("settingsPrivacy.retentionLink")}</a></> : null}
        </p>
      </Field>
      <Field id="monthlyCapEur" label={t("adminPrivacy.fieldBudget")} hint={t("adminPrivacy.fieldBudgetHint")}>
        <input className="nh-input" id="monthlyCapEur" name="monthlyCapEur" type="number" inputMode="numeric" min={0} max={100000} step={1} required defaultValue={p.monthlyCapEur} data-testid="console-assistant-budget-input" />
      </Field>
      <Field id="monthlyTokenCap" label={t("adminPrivacy.fieldTokenCap")} hint={t("adminPrivacy.fieldTokenCapHint")}>
        <input className="nh-input" id="monthlyTokenCap" name="monthlyTokenCap" type="number" inputMode="numeric" min={0} max={2000000000} step={1} required defaultValue={p.monthlyTokenCap} data-testid="console-assistant-token-cap-input" />
      </Field>
      <Field id="rules" label={t("adminPrivacy.fieldRules")} hint={t("adminPrivacy.fieldRulesHint")}>
        <textarea className="nh-input" id="rules" name="rules" rows={4} defaultValue={p.rules} placeholder={t("adminPrivacy.rulesPlaceholder")} />
      </Field>
      <Field id="patterns" label={t("adminPrivacy.fieldPatterns")} hint={t("adminPrivacy.fieldPatternsHint")}>
        <textarea className="nh-input" id="patterns" name="patterns" rows={2} defaultValue={p.patterns.join("\n")} />
      </Field>
      {state.code ? <p className={c.note} data-tone="error" role="alert" data-testid="console-assistant-error">{state.code === "bad-pattern" ? t("adminPrivacy.errBadPattern", { pattern: state.detail ?? "" }) : t(ERR[state.code])}</p> : null}
      {state.ok ? <p className={c.note} data-tone="ok" role="status">{t("adminPrivacy.saved")}</p> : null}
      <div className={c.foot}>
        <button className={c.primary} type="submit" disabled={pending} data-testid="console-assistant-save">{pending ? t("adminPrivacy.saving") : t("adminPrivacy.save")}</button>
      </div>
    </form>
  );
}
