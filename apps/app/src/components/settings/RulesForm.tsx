"use client";
// /settings/rules: promise and outcome days, the spend rule and the loop rules. One form in three
// cards; any Save sends all of it.
import { useActionState, useState } from "react";
import type { RulesForm as Values } from "@/features/settings/company-forms";
import { LOOP_DEFAULTS, type RewardKind } from "@/features/loop/rules";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { saveRulesAction, type SettingsFormState } from "@/server/actions/settings/company";
import { Card, Foot, Row } from "./SettingsParts";
import s from "./settings.module.css";

const REWARDS: RewardKind[] = ["none", "thanks", "fixed", "share"];
const STEPS = ["discussion", "projects", "measure", "recognition"] as const;
const rewardLabel = (k: RewardKind) => `settingsCompany.reward${k[0].toUpperCase()}${k.slice(1)}` as MessageKey;

function Num({ id, tid, value, size = "num", invalid }: { id: string; tid: string; value: number | string; size?: "num" | "money"; invalid?: boolean }) {
  return (
    <input className={s.input} data-size={size} id={id} name={id} type="number" inputMode="numeric" defaultValue={value}
      aria-invalid={invalid || undefined} data-testid={`settings-rules-${tid}`} />
  );
}

/** The measure days as chips; the form still sends them comma-separated. */
function MeasureDays({ initial, unit }: { initial: number[]; unit: string }) {
  const t = useT();
  const [days, setDays] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const add = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n > 0 && !days.includes(n)) setDays([...days, n].sort((a, b) => a - b));
    setDraft(null);
  };
  return (
    <div className={s.inline}>
      <input type="hidden" name="measureDays" value={days.join(", ")} data-testid="settings-rules-measure-days" />
      {days.map((d) => (
        <span key={d} className={s.chip}>
          {d}
          <button type="button" className={s.chipX} aria-label={t("settingsCompany.removeItem", { name: String(d) })} onClick={() => setDays(days.filter((x) => x !== d))}>×</button>
        </span>
      ))}
      {draft === null ? (
        <button type="button" className={s.dashed} aria-label={t("settingsCompany.addMeasureDay")} onClick={() => setDraft("")}>+</button>
      ) : (
        <input className={s.input} data-size="num" type="number" inputMode="numeric" autoFocus value={draft} aria-label={t("settingsCompany.addMeasureDay")}
          onChange={(e) => setDraft(e.target.value)} onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Escape") setDraft(null);
          }} />
      )}
      <span className={s.unit}>{unit}</span>
    </div>
  );
}

export function RulesForm({ slug, values, demo }: { slug: string; values: Values; demo?: boolean }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveRulesAction, {});
  const [kind, setKind] = useState<RewardKind>(values.loop.reward.kind);
  const [spendOn, setSpendOn] = useState(values.rules.spend !== null);
  const [steps, setSteps] = useState(values.rules.steps);
  const [handover, setHandover] = useState(values.rules.deadlineHandover);
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  const { rules, loop } = values;
  const days = t("settingsCompany.daysUnit");
  const formError = state.error && !state.field ? t(state.error) : undefined;
  const status = formError ?? (state.ok ? t("settingsCompany.saved") : demo ? t("settingsCompany.demoData") : undefined);
  const foot = (last?: boolean) => (
    <Foot status={last ? status : undefined} tone={formError ? "error" : undefined}
      statusTestId={last ? (formError ? "settings-rules-error" : state.ok ? "settings-rules-saved" : undefined) : undefined}>
      <button className={s.save} type="submit" disabled={pending || demo} data-testid={last ? "settings-rules-save" : undefined}>
        {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
      </button>
    </Foot>
  );
  return (
    <form action={act} className={s.page} data-testid="settings-rules-form">
      <input type="hidden" name="slug" value={slug} />
      <Card title={t("settingsCompany.cardPromises")}>
        <Row id="promiseDays" label={t("settingsCompany.answerWithin")} wide help={t("settingsCompany.answerHelp")} error={err("promiseDays")}>
          <div className={s.inline}><Num id="promiseDays" tid="promise-days" value={rules.promiseDays} invalid={Boolean(err("promiseDays"))} /><span className={s.unit}>{t("settingsCompany.workingDaysUnit")}</span></div>
        </Row>
        <Row id="outcomeDays" label={t("settingsCompany.measureOutcome")} wide help={t("settingsCompany.outcomeHelp")} error={err("outcomeDays")}>
          <div className={s.inline}><Num id="outcomeDays" tid="outcome-days" value={rules.outcomeDays} invalid={Boolean(err("outcomeDays"))} /><span className={s.unit}>{days}</span></div>
        </Row>
        {foot()}
      </Card>

      <Card title={t("settingsCompany.cardSpend")}>
        <label className={s.switch}>
          <input type="checkbox" role="switch" checked={spendOn} onChange={(e) => setSpendOn(e.target.checked)} data-testid="settings-rules-spend-on" />
          {t("settingsCompany.spendSwitch")}
        </label>
        {spendOn ? (
          <>
            <Row id="spendLimitEur" label={t("settingsCompany.spendAmount")} wide error={err("spendLimitEur")}>
              <div className={s.inline}><Num id="spendLimitEur" tid="spend-limit" size="money" value={rules.spend?.limitEur ?? ""} invalid={Boolean(err("spendLimitEur"))} /><span className={s.unit}>€</span></div>
            </Row>
            <Row id="spendText" label={t("settingsCompany.spendWords")} wide help={t("settingsCompany.spendHelp")} error={err("spendText")}>
              <input className={s.input} id="spendText" name="spendText" defaultValue={rules.spend?.text ?? ""} aria-invalid={Boolean(err("spendText")) || undefined} data-testid="settings-rules-spend-text" />
            </Row>
          </>
        ) : null}
        {foot()}
      </Card>

      <Card title={t("settingsCompany.cardFlow")}>
        <Row id="fastLaneEur" label={t("settingsCompany.fastLane")} wide help={t("settingsCompany.fastLaneHelp")} error={err("fastLaneEur")}>
          <div className={s.inline}><Num id="fastLaneEur" tid="fast-lane" size="money" value={loop.fastLaneEur} invalid={Boolean(err("fastLaneEur"))} /><span className={s.unit}>€</span></div>
        </Row>
        <Row id="discussEveryDays" label={t("settingsCompany.checkIn")} wide error={err("discussEveryDays")}>
          <div className={s.inline}><Num id="discussEveryDays" tid="check-in-days" value={loop.discussEveryDays} invalid={Boolean(err("discussEveryDays"))} /><span className={s.unit}>{days}</span></div>
        </Row>
        <Row id="discussMaxRounds" label={t("settingsCompany.rounds")} wide help={t("settingsCompany.roundsHelp")} error={err("discussMaxRounds")}>
          <Num id="discussMaxRounds" tid="max-rounds" value={loop.discussMaxRounds} invalid={Boolean(err("discussMaxRounds"))} />
        </Row>
        <Row label={t("settingsCompany.measureProject")} wide error={err("measureDays")}>
          <MeasureDays initial={loop.measureDays} unit={days} />
        </Row>
        <Row id="tolerancePct" label={t("settingsCompany.unchanged")} wide help={t("settingsCompany.unchangedHelp")} error={err("tolerancePct")}>
          <div className={s.inline}><Num id="tolerancePct" tid="tolerance" value={loop.tolerancePct} invalid={Boolean(err("tolerancePct"))} /><span className={s.unit}>%</span></div>
        </Row>
        <Row id="rewardRule" label={t("settingsCompany.reward")} wide error={err("rewardRule")}>
          <select className={s.input} id="rewardRule" name="rewardRule" value={kind} onChange={(e) => setKind(e.target.value as RewardKind)} data-testid="settings-rules-reward">
            {REWARDS.map((r) => <option key={r} value={r}>{t(rewardLabel(r))}</option>)}
          </select>
        </Row>
        {kind === "fixed" ? (
          <Row id="rewardAmountEur" label={t("settingsCompany.rewardAmount")} wide error={err("rewardAmountEur")}>
            <Num id="rewardAmountEur" tid="reward-amount" size="money" value={loop.reward.amount ?? ""} />
          </Row>
        ) : null}
        {kind === "share" ? (
          <>
            <Row id="rewardSharePct" label={t("settingsCompany.rewardShareLabel")} wide error={err("rewardSharePct")}>
              <Num id="rewardSharePct" tid="reward-share" value={loop.reward.sharePct ?? ""} />
            </Row>
            <Row id="rewardCapEur" label={t("settingsCompany.rewardCap")} wide help={t("settingsCompany.rewardCapHint")} error={err("rewardCapEur")}>
              <Num id="rewardCapEur" tid="reward-cap" size="money" value={loop.reward.capEur ?? ""} />
            </Row>
          </>
        ) : null}
        {foot()}
      </Card>

      <Card title={t("settingsCompany.cardSteps")}>
        {STEPS.map((k) => (
          <label key={k} className={s.switch}>
            <input type="checkbox" role="switch" name={`step${k[0].toUpperCase()}${k.slice(1)}`} checked={steps[k]}
              onChange={(e) => setSteps({ ...steps, [k]: e.target.checked })} data-testid={`settings-rules-step-${k}`} />
            {t(`settingsCompany.step${k[0].toUpperCase()}${k.slice(1)}` as MessageKey)}
          </label>
        ))}
        {foot()}
      </Card>

      <Card title={t("settingsCompany.cardAnswerPromise")}>
        <label className={s.switch}>
          <input type="checkbox" role="switch" name="deadlineHandover" checked={handover}
            onChange={(e) => setHandover(e.target.checked)} data-testid="settings-rules-deadline-handover" />
          {t("settingsCompany.deadlineHandover")}
        </label>
        <p className={s.help}>{t("settingsCompany.deadlineHandoverHelp")}</p>
        <Row id="escalationDays" label={t("settingsCompany.escalateAfter")} wide help={t("settingsCompany.escalateHelp")} error={err("escalationDays")}>
          <div className={s.inline}><Num id="escalationDays" tid="escalation-days" value={rules.escalationDays ?? LOOP_DEFAULTS.escalationDays} invalid={Boolean(err("escalationDays"))} /><span className={s.unit}>{t("settingsCompany.workingDaysUnit")}</span></div>
        </Row>
        <Row id="projectStartDays" label={t("settingsCompany.projectStartDays")} wide help={t("settingsCompany.projectStartHelp")} error={err("projectStartDays")}>
          <div className={s.inline}><Num id="projectStartDays" tid="project-start-days" value={rules.projectStartDays ?? LOOP_DEFAULTS.projectStartDays} invalid={Boolean(err("projectStartDays"))} /><span className={s.unit}>{t("settingsCompany.workingDaysUnit")}</span></div>
        </Row>
        {/* The reasoned no (plan NOR, D23). */}
        <Row id="noReasonMin" label={t("settingsCompany.noReasonMin")} wide help={t("settingsCompany.noReasonMinHelp")} error={err("noReasonMin")}>
          <div className={s.inline}><Num id="noReasonMin" tid="no-reason-min" value={rules.noReasonMin ?? LOOP_DEFAULTS.noReasonMin} invalid={Boolean(err("noReasonMin"))} /><span className={s.unit}>{t("settingsCompany.charactersUnit")}</span></div>
        </Row>
        <Row id="appealDays" label={t("settingsCompany.appealDays")} wide help={t("settingsCompany.appealDaysHelp")} error={err("appealDays")}>
          <div className={s.inline}><Num id="appealDays" tid="appeal-days" value={rules.appealDays ?? LOOP_DEFAULTS.appealDays} invalid={Boolean(err("appealDays"))} /><span className={s.unit}>{t("settingsCompany.workingDaysUnit")}</span></div>
        </Row>
        <Row id="questionDays" label={t("settingsCompany.questionDays")} wide help={t("settingsCompany.questionDaysHelp")} error={err("questionDays")}>
          <div className={s.inline}><Num id="questionDays" tid="question-days" value={rules.questionDays ?? LOOP_DEFAULTS.questionDays} invalid={Boolean(err("questionDays"))} /><span className={s.unit}>{t("settingsCompany.workingDaysUnit")}</span></div>
        </Row>
        {foot()}
      </Card>

      {/* Decision Q1.7: who a member's raise is preselected as. The member can change it per raise on the last look. */}
      <Card title={t("settingsCompany.cardPosting")}>
        <fieldset className={s.radioGroup}>
          <legend className={s.help}>{t("settingsCompany.postAsLegend")}</legend>
          <label className={s.radio}>
            <input type="radio" name="postAs" value="handle" defaultChecked={rules.postAs !== "name"} data-testid="settings-rules-post-handle" />
            {t("settingsCompany.postAsHandle")}
          </label>
          <label className={s.radio}>
            <input type="radio" name="postAs" value="name" defaultChecked={rules.postAs === "name"} data-testid="settings-rules-post-name" />
            {t("settingsCompany.postAsName")}
          </label>
        </fieldset>
        <p className={s.help}>{t("settingsCompany.postAsHelp")}</p>
        {foot(true)}
      </Card>
    </form>
  );
}
