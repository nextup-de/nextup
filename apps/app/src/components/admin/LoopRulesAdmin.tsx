"use client";
// /admin/knowledge: what happens after the routing, as this company decides it - how often a
// discussion checks in, when a finished project is measured, and how an idea is rewarded
// (src/features/loop/rules.ts, docs/plans/2026-10-15_idea-to-project.md).
// Client only for useActionState's saved/error line.
import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import type { LoopRules, RewardKind } from "@/features/loop/rules";
import { saveLoopSettingsAction, type LoopSettingsState } from "@/server/actions/loop-admin";
import styles from "@/app/admin/admin.module.css";

const REWARDS: { kind: RewardKind; label: string }[] = [
  { kind: "none", label: "No reward" },
  { kind: "thanks", label: "A thank-you, no money" },
  { kind: "fixed", label: "A fixed amount" },
  { kind: "share", label: "A share of the measured yearly saving" },
];

export function LoopRulesAdmin({ slug, rules }: { slug: string; rules: LoopRules }) {
  const [state, act, pending] = useActionState<LoopSettingsState, FormData>(saveLoopSettingsAction, {});
  const [kind, setKind] = useState<RewardKind>(rules.reward.kind);
  return (
    <section className={styles.card}>
      <h2>After the decision</h2>
      <p className="nh-hint">
        A discussion checks in on a fixed rhythm until the decision is due. A finished project is measured against the number taken
        before it started, and the author is rewarded by your own rule. NextUp records the reward; payroll pays it.
      </p>
      <form action={act} className={styles.grid}>
        <input type="hidden" name="slug" value={slug} />
        <Field id="discussEveryDays" label="Check-in every (days)" hint="3 by default.">
          <input className="nh-input" id="discussEveryDays" name="discussEveryDays" type="number" min={1} max={30} defaultValue={rules.discussEveryDays} />
        </Field>
        <Field id="discussMaxRounds" label="Rounds before the decision is due" hint="3 by default. One more round needs a manager.">
          <input className="nh-input" id="discussMaxRounds" name="discussMaxRounds" type="number" min={1} max={10} defaultValue={rules.discussMaxRounds} />
        </Field>
        <Field id="fastLaneEur" label="Skip the discussion below (€)" hint="The team's spend authority: a smaller idea can be decided at once.">
          <input className="nh-input" id="fastLaneEur" name="fastLaneEur" type="number" min={0} defaultValue={rules.fastLaneEur} />
        </Field>
        <Field id="measureDays" label="Measure after (days)" hint={"Days after a project is done, comma-separated. \"30, 90\" by default."}>
          <input className="nh-input" id="measureDays" name="measureDays" defaultValue={rules.measureDays.join(", ")} />
        </Field>
        <Field id="tolerancePct" label="Counts as the same within (%)" hint="2 by default: a smaller move is neither better nor worse.">
          <input className="nh-input" id="tolerancePct" name="tolerancePct" type="number" min={0} max={50} defaultValue={rules.tolerancePct} />
        </Field>
        <Field id="rewardRule" label="Reward">
          <select className="nh-input" id="rewardRule" name="rewardRule" value={kind} onChange={(e) => setKind(e.target.value as RewardKind)}>
            {REWARDS.map((r) => <option key={r.kind} value={r.kind}>{r.label}</option>)}
          </select>
        </Field>
        {kind === "fixed" ? (
          <Field id="rewardAmountEur" label="Amount (€)">
            <input className="nh-input" id="rewardAmountEur" name="rewardAmountEur" type="number" min={0} defaultValue={rules.reward.amount ?? ""} />
          </Field>
        ) : null}
        {kind === "share" ? (
          <>
            <Field id="rewardSharePct" label="Share of the yearly saving (%)">
              <input className="nh-input" id="rewardSharePct" name="rewardSharePct" type="number" min={0} max={100} defaultValue={rules.reward.sharePct ?? ""} />
            </Field>
            <Field id="rewardCapEur" label="Up to (€)" hint="Empty: no cap.">
              <input className="nh-input" id="rewardCapEur" name="rewardCapEur" type="number" min={0} defaultValue={rules.reward.capEur ?? ""} />
            </Field>
          </>
        ) : null}
        {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
        {state.ok ? <p className="nh-hint" role="status">Saved.</p> : null}
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </form>
    </section>
  );
}
