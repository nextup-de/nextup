"use client";
// Honest before vs. after (docs/plans/2026-10-15_idea-to-project.md §4-5): the baseline before the
// start - or "no number possible" and why -, the checks 30 and 90 days after done with the verdict the
// numbers give (shown when worse too), and the reward by the company's own rule.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { EventPayload } from "@/features/cases/events";
import { suggestedReward } from "@/features/loop/rules";
import type { CheckDue, ReducedProject } from "@/features/projects/types";
import { verdictOf } from "@/features/projects/verdict";
import { baselineText, changeText, euros, fmtNumber, movement, rewardRuleText, type BaselineHint } from "@/features/projects/views";
import { useRights, useSend, VerdictChip } from "./parts";
import styles from "./Projects.module.css";

const num = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function BaselinePanel({ p, hint }: { p: ReducedProject; hint: BaselineHint | null }) {
  const { act, f } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const b = p.baseline;
  const [editing, setEditing] = useState(false);
  const [none, setNone] = useState(false);
  const [metric, setMetric] = useState("");
  const [unit, setUnit] = useState("");
  const [value, setValue] = useState("");
  const [better, setBetter] = useState<"up" | "down">("down");
  const [source, setSource] = useState("");
  const [why, setWhy] = useState("");
  const open = r.baseline && (!b || editing);

  const applyHint = () => {
    if (!hint) return;
    setNone(false);
    setMetric(hint.metric);
    setUnit(hint.unit);
    if (hint.better) setBetter(hint.better);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = num(value);
    const payload: EventPayload = none ? { none: true, why: why.trim() } : { metric: metric.trim(), unit: unit.trim(), value: v ?? Number.NaN, better, source: source.trim() };
    const ok = send("project.baseline", payload, () =>
      act.project.baseline(p.id, none ? { none: true, why: why.trim() } : { metric: metric.trim(), unit: unit.trim(), value: v as number, better, source: source.trim() }));
    if (ok) setEditing(false);
  };

  return (
    <section className={styles.panel} aria-labelledby={"baseline-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"baseline-" + p.id} className={styles.h2}>Baseline</h2>
        <span className={styles.muted}>{b ? "taken " + f(b.day) + " by " + b.by : "the number before the start"}</span>
      </div>
      {b && !editing && (
        <div className={styles.baseline}>
          <div className={styles.big}>{b.none ? "No number possible" : fmtNumber(b.value) + (b.unit ? " " + b.unit : "")}</div>
          <div className={styles.muted}>{b.none ? b.why : baselineText(b).split(" · ").slice(1).join(" · ") + (b.source ? " · source: " + b.source : "")}</div>
          {r.baseline && <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>Take it again</button>}
        </div>
      )}
      {!b && !r.baseline && <p className={styles.emptyLine}>Not taken yet. The lead takes it before the project starts.</p>}
      {open && (
        <form className={styles.form} onSubmit={submit} aria-label="Baseline">
          {hint && !none && (
            <div className={styles.suggestRow}>
              <span className={styles.suggestLabel}>Suggested</span>
              <span className={styles.suggestText}>
                {hint.metric}{hint.unit ? ", " + hint.unit : ""}{hint.better ? ", " + (hint.better === "down" ? "lower" : "higher") + " is better" : ""}
                {hint.goal && <span className={styles.muted}> · from the goal “{hint.goal}”</span>}
              </span>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={applyHint}>Use it</button>
            </div>
          )}
          <label className="nh-check">
            <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
            No number is possible
          </label>
          {none ? (
            <label className="nh-field">
              <span className="nh-label">Why not?</span>
              <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={why} onChange={(e) => setWhy(e.target.value)} />
            </label>
          ) : (
            <div className={styles.fields}>
              <label className={`nh-field ${styles.wide}`}>
                <span className="nh-label">What is measured</span>
                <input className={`nh-input ${styles.input}`} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="Changeover time" />
              </label>
              <label className="nh-field">
                <span className="nh-label">Today’s number</span>
                <input className={`nh-input ${styles.input}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="42" />
              </label>
              <label className="nh-field">
                <span className="nh-label">Unit</span>
                <input className={`nh-input ${styles.input}`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="minutes" />
              </label>
              <fieldset className={`${styles.radios} ${styles.wide}`}>
                <legend className="nh-label">Which way is better</legend>
                <label className="nh-check"><input type="radio" name={"better-" + p.id} checked={better === "down"} onChange={() => setBetter("down")} />Lower is better</label>
                <label className="nh-check"><input type="radio" name={"better-" + p.id} checked={better === "up"} onChange={() => setBetter("up")} />Higher is better</label>
              </fieldset>
              <label className={`nh-field ${styles.wide}`}>
                <span className="nh-label">Where the number comes from</span>
                <input className={`nh-input ${styles.input}`} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Weekly MES report" />
              </label>
            </div>
          )}
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">Save the baseline</button>
            {editing && <button type="button" className={styles.quiet} onClick={() => setEditing(false)}>Cancel</button>}
          </span>
        </form>
      )}
    </section>
  );
}

export function MeasurePanel({ p }: { p: ReducedProject }) {
  const { S } = useDemo();
  const days = S.rules.measureDays.join(" and ");
  return (
    <section className={styles.panel} aria-labelledby={"measure-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"measure-" + p.id} className={styles.h2}>Measure</h2>
        <span className={styles.muted}>the verdict is computed, never typed in</span>
      </div>
      {p.baseline?.none && p.doneDay !== null && (
        <p className={styles.emptyLine}>Not measured: no number was possible. {p.baseline.why}</p>
      )}
      {p.checks.length === 0 && !(p.baseline?.none && p.doneDay !== null) && (
        <p className={styles.emptyLine}>{p.stopped ? "The project stopped before it was measured." : "Checks open " + days + " days after the project is done."}</p>
      )}
      {p.checks.map((c) => <Check key={c.check} p={p} c={c} />)}
    </section>
  );
}

function Check({ p, c }: { p: ReducedProject; c: CheckDue }) {
  const { act, S, f } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const m = p.measures.find((x) => x.check === c.check);
  const isOpen = S.day >= c.opensDay;
  const v = num(value);
  const preview = v !== null ? verdictOf(p.baseline, v, S.rules.tolerancePct) : null;

  return (
    <div className={styles.check} role="group" aria-label={c.check + "-day check"}>
      <div className={styles.checkHead}>
        <span className={styles.strong}>{c.check}-day check</span>
        <span className={styles.muted}>opens {f(c.opensDay)} · due {f(c.dueDay)}</span>
        {c.late && <span className={styles.due} data-late="true">late{p.escalated?.what === "measure" ? " · with " + p.escalated.to : ""}</span>}
      </div>
      {m ? (
        <div className={styles.result}>
          <span className={styles.big}>{movement(p.baseline, m)}</span>
          <VerdictChip verdict={m.verdict} />
          {m.changePct !== null && <span className={styles.change} data-verdict={m.verdict}>{changeText(m.changePct)}</span>}
          <span className={styles.muted}>{(m.source ? m.source + " · " : "") + "recorded " + f(m.day) + " by " + m.by}</span>
        </div>
      ) : !isOpen ? (
        <p className={styles.muted}>Opens {f(c.opensDay)}.</p>
      ) : r.measure(c.check) ? (
        <form className={styles.measureForm} aria-label={"Record the " + c.check + "-day measure"}
          onSubmit={(e) => { e.preventDefault(); if (send("project.measured", { check: c.check, value: v ?? Number.NaN }, () => act.project.measure(p.id, c.check, v as number, source.trim()))) { setValue(""); setSource(""); } }}>
          <label className="nh-field">
            <span className="nh-label">The number now{p.baseline && !p.baseline.none && p.baseline.unit ? " (" + p.baseline.unit + ")" : ""}</span>
            <input className={`nh-input ${styles.input}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className={`nh-field ${styles.grow}`}>
            <span className="nh-label">Source</span>
            <input className={`nh-input ${styles.input}`} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where the number comes from" />
          </label>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={v === null}>Record the measure</button>
          {preview && (
            <span className={styles.preview} role="status">
              That reads as <VerdictChip verdict={preview.verdict} /> {changeText(preview.changePct)}
            </span>
          )}
        </form>
      ) : (
        <p className={styles.muted}>Open since {f(c.opensDay)}. The lead records it.</p>
      )}
    </div>
  );
}

export function RewardPanel({ p }: { p: ReducedProject }) {
  const { act, S, f, persona } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const rule = S.rules.reward;
  const [saving, setSaving] = useState("");
  const [amount, setAmount] = useState<string | null>(null); // null: still the rule's suggestion
  const [note, setNote] = useState("");
  if (!p.reward && !p.rewardDue && !(p.status === "measured" && rule.kind === "none")) return null;

  const suggested = suggestedReward(rule, num(saving));
  const takesAmount = rule.kind === "fixed" || rule.kind === "share";
  const shown = amount ?? (suggested !== null ? String(suggested) : "");
  const handle = persona.who.handle;

  return (
    <section className={styles.panel} aria-labelledby={"reward-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"reward-" + p.id} className={styles.h2}>Reward</h2>
        <span className={styles.muted}>the company’s own rule · payroll pays it, outside NextUp</span>
      </div>
      {p.reward ? (
        <div className={styles.baseline}>
          <div className={styles.strong}>{p.reward.amount !== null ? euros(p.reward.amount) : p.reward.rule === "thanks" ? "A thank-you, on record" : p.reward.rule}</div>
          <div className={styles.muted}>Recorded {f(p.reward.day)} by {p.reward.by}{p.reward.note ? ": " + p.reward.note : ""}</div>
          {p.claimed ? (
            <div className={styles.muted}>Claimed by the author {f(p.claimed.day)}.</div>
          ) : r.claim ? (
            <div className={styles.claim}>
              <span>{handle && p.authors.includes(handle) ? "You raised this idea as " + handle + ". Claim it yourself - nobody else learns who it was." : "You raised this idea. Claim the reward."}</span>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => send("project.claimed", {}, () => act.project.claim(p.id))}>Claim the reward</button>
            </div>
          ) : null}
        </div>
      ) : rule.kind === "none" ? (
        <p className={styles.emptyLine}>This company gives no reward, so the project is closed once it is measured.</p>
      ) : r.reward ? (
        <form className={styles.form} aria-label="Record the reward"
          onSubmit={(e) => { e.preventDefault(); const a = takesAmount ? num(shown) : null; send("project.rewarded", {}, () => act.project.reward(p.id, rule.kind, a ?? undefined, note.trim() || undefined)); }}>
          <div className={styles.due}>Reward due by your rule: {rewardRuleText(rule)}</div>
          {rule.kind === "share" && (
            <label className="nh-field">
              <span className="nh-label">Measured yearly saving (€)</span>
              <input className={`nh-input ${styles.input}`} inputMode="decimal" value={saving} onChange={(e) => { setSaving(e.target.value); setAmount(null); }} />
            </label>
          )}
          {takesAmount && (
            <label className="nh-field">
              <span className="nh-label">Amount (€){suggested !== null ? " - the rule suggests " + euros(suggested) : ""}</span>
              <input className={`nh-input ${styles.input}`} inputMode="decimal" value={shown} onChange={(e) => setAmount(e.target.value)} />
            </label>
          )}
          <label className="nh-field">
            <span className="nh-label">Note (optional)</span>
            <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thanked at the team meeting" />
          </label>
          <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">Record the reward</button></span>
        </form>
      ) : (
        <p className={styles.emptyLine}>Reward due by the company’s rule: {rewardRuleText(rule)}. A manager records it.</p>
      )}
    </section>
  );
}
