"use client";
// /settings/rules: promise and outcome days, the spend rule and the loop rules.
import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import type { RulesForm as Values } from "@/features/settings/company-forms";
import type { RewardKind } from "@/features/loop/rules";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { saveRulesAction, type SettingsFormState } from "@/server/actions/settings/company";

const grid = { display: "grid", gap: 16, maxWidth: 640 } as const;
const REWARDS: RewardKind[] = ["none", "thanks", "fixed", "share"];
const rewardLabel = (k: RewardKind) => `settingsCompany.reward${k[0].toUpperCase()}${k.slice(1)}` as MessageKey;

function Num({ id, tid, value }: { id: string; tid: string; value: number | string }) {
  return <input className="nh-input" id={id} name={id} type="number" inputMode="numeric" defaultValue={value} data-testid={`settings-rules-${tid}`} />;
}

export function RulesForm({ slug, values }: { slug: string; values: Values }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveRulesAction, {});
  const [kind, setKind] = useState<RewardKind>(values.loop.reward.kind);
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  const { rules, loop } = values;
  return (
    <form action={act} style={grid} data-testid="settings-rules-form">
      <input type="hidden" name="slug" value={slug} />
      <Field id="promiseDays" label={t("settingsCompany.promiseDays")} error={err("promiseDays")}>
        <Num id="promiseDays" tid="promise-days" value={rules.promiseDays} />
      </Field>
      <Field id="outcomeDays" label={t("settingsCompany.outcomeDays")} error={err("outcomeDays")}>
        <Num id="outcomeDays" tid="outcome-days" value={rules.outcomeDays} />
      </Field>
      <Field id="spendLimitEur" label={t("settingsCompany.spendLimit")} hint={t("settingsCompany.spendLimitHint")} error={err("spendLimitEur")}>
        <Num id="spendLimitEur" tid="spend-limit" value={rules.spend?.limitEur ?? ""} />
      </Field>
      <Field id="spendText" label={t("settingsCompany.spendText")} error={err("spendText")}>
        <input className="nh-input" id="spendText" name="spendText" defaultValue={rules.spend?.text ?? ""} data-testid="settings-rules-spend-text" />
      </Field>
      <Field id="discussEveryDays" label={t("settingsCompany.discussEveryDays")} error={err("discussEveryDays")}>
        <Num id="discussEveryDays" tid="check-in-days" value={loop.discussEveryDays} />
      </Field>
      <Field id="discussMaxRounds" label={t("settingsCompany.discussMaxRounds")} error={err("discussMaxRounds")}>
        <Num id="discussMaxRounds" tid="max-rounds" value={loop.discussMaxRounds} />
      </Field>
      <Field id="fastLaneEur" label={t("settingsCompany.fastLaneEur")} error={err("fastLaneEur")}>
        <Num id="fastLaneEur" tid="fast-lane" value={loop.fastLaneEur} />
      </Field>
      <Field id="measureDays" label={t("settingsCompany.measureDays")} hint={t("settingsCompany.measureDaysHint")} error={err("measureDays")}>
        <input className="nh-input" id="measureDays" name="measureDays" defaultValue={loop.measureDays.join(", ")} data-testid="settings-rules-measure-days" />
      </Field>
      <Field id="tolerancePct" label={t("settingsCompany.tolerancePct")} error={err("tolerancePct")}>
        <Num id="tolerancePct" tid="tolerance" value={loop.tolerancePct} />
      </Field>
      <Field id="rewardRule" label={t("settingsCompany.reward")} error={err("rewardRule")}>
        <select className="nh-input" id="rewardRule" name="rewardRule" value={kind} onChange={(e) => setKind(e.target.value as RewardKind)} data-testid="settings-rules-reward">
          {REWARDS.map((r) => <option key={r} value={r}>{t(rewardLabel(r))}</option>)}
        </select>
      </Field>
      {kind === "fixed" ? (
        <Field id="rewardAmountEur" label={t("settingsCompany.rewardAmount")} error={err("rewardAmountEur")}>
          <Num id="rewardAmountEur" tid="reward-amount" value={loop.reward.amount ?? ""} />
        </Field>
      ) : null}
      {kind === "share" ? (
        <>
          <Field id="rewardSharePct" label={t("settingsCompany.rewardShareLabel")} error={err("rewardSharePct")}>
            <Num id="rewardSharePct" tid="reward-share" value={loop.reward.sharePct ?? ""} />
          </Field>
          <Field id="rewardCapEur" label={t("settingsCompany.rewardCap")} hint={t("settingsCompany.rewardCapHint")} error={err("rewardCapEur")}>
            <Num id="rewardCapEur" tid="reward-cap" value={loop.reward.capEur ?? ""} />
          </Field>
        </>
      ) : null}
      {state.error && !state.field ? <p className="nh-error" role="alert" data-testid="settings-rules-error">{t(state.error)}</p> : null}
      {state.ok ? <p className="nh-hint" role="status" data-testid="settings-rules-saved">{t("settingsCompany.saved")}</p> : null}
      <div>
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-rules-save">
          {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
        </button>
      </div>
    </form>
  );
}
