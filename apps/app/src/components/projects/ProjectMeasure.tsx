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
import { baselineText, betterText, changeText, euros, fmtNumber, movement, rewardRuleText, type BaselineHint } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useRights, useSend, VerdictChip } from "./parts";
import styles from "./Projects.module.css";

const num = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function BaselinePanel({ p, hint }: { p: ReducedProject; hint: BaselineHint | null }) {
  const { act, f } = useDemo();
  const t = useT();
  const locale = useLocale();
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
        <h2 id={"baseline-" + p.id} className={styles.h2}>{t("projects.stageBaseline")}</h2>
        <span className={styles.muted}>{b ? t("projects.baselineTaken", { day: f(b.day), name: b.by }) : t("projects.baselineBefore")}</span>
      </div>
      {b && !editing && (
        <div className={styles.baseline}>
          <div className={styles.big}>{b.none ? t("projects.noNumberPossible") : fmtNumber(b.value, locale) + (b.unit ? " " + b.unit : "")}</div>
          <div className={styles.muted}>{b.none ? b.why : baselineText(b, locale).split(" · ").slice(1).join(" · ") + (b.source ? " · " + t("projects.baselineSourceIs", { source: b.source }) : "")}</div>
          {r.baseline && <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>{t("projects.takeAgain")}</button>}
        </div>
      )}
      {!b && !r.baseline && <p className={styles.emptyLine}>{t("projects.baselineNotTaken")}</p>}
      {open && (
        <form className={styles.form} onSubmit={submit} aria-label={t("projects.stageBaseline")}>
          {hint && !none && (
            <div className={styles.suggestRow}>
              <span className={styles.suggestLabel}>{t("projects.suggested")}</span>
              <span className={styles.suggestText}>
                {hint.metric}{hint.unit ? ", " + hint.unit : ""}{hint.better ? ", " + betterText(hint.better, locale) : ""}
                {hint.goal && <span className={styles.muted}> · {t("projects.fromGoal", { goal: hint.goal })}</span>}
              </span>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={applyHint}>{t("projects.useIt")}</button>
            </div>
          )}
          <label className="nh-check">
            <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
            {t("projects.noNumberIsPossible")}
          </label>
          {none ? (
            <label className="nh-field">
              <span className="nh-label">{t("projects.whyNot")}</span>
              <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={why} onChange={(e) => setWhy(e.target.value)} />
            </label>
          ) : (
            <div className={styles.fields}>
              <label className={`nh-field ${styles.wide}`}>
                <span className="nh-label">{t("projects.whatMeasured")}</span>
                <input className={`nh-input ${styles.input}`} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder={t("projects.metricPlaceholder")} />
              </label>
              <label className="nh-field">
                <span className="nh-label">{t("projects.todaysNumber")}</span>
                <input className={`nh-input ${styles.input}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="42" />
              </label>
              <label className="nh-field">
                <span className="nh-label">{t("projects.unit")}</span>
                <input className={`nh-input ${styles.input}`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("projects.unitPlaceholder")} />
              </label>
              <fieldset className={`${styles.radios} ${styles.wide}`}>
                <legend className="nh-label">{t("projects.whichWay")}</legend>
                <label className="nh-check"><input type="radio" name={"better-" + p.id} checked={better === "down"} onChange={() => setBetter("down")} />{t("projects.lowerIsBetter")}</label>
                <label className="nh-check"><input type="radio" name={"better-" + p.id} checked={better === "up"} onChange={() => setBetter("up")} />{t("projects.higherIsBetter")}</label>
              </fieldset>
              <label className={`nh-field ${styles.wide}`}>
                <span className="nh-label">{t("projects.baselineSource")}</span>
                <input className={`nh-input ${styles.input}`} value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("projects.sourcePlaceholder")} />
              </label>
            </div>
          )}
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projects.saveBaseline")}</button>
            {editing && <button type="button" className={styles.quiet} onClick={() => setEditing(false)}>{t("common.cancel")}</button>}
          </span>
        </form>
      )}
    </section>
  );
}

export function MeasurePanel({ p }: { p: ReducedProject }) {
  const { S } = useDemo();
  const t = useT();
  const days = S.rules.measureDays.join(" " + t("projects.andWord") + " ");
  return (
    <section className={styles.panel} aria-labelledby={"measure-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"measure-" + p.id} className={styles.h2}>{t("projects.measureTitle")}</h2>
        <span className={styles.muted}>{t("projects.measureSub")}</span>
      </div>
      {p.baseline?.none && p.doneDay !== null && (
        <p className={styles.emptyLine}>{t("projects.notMeasuredNoNumber")} {p.baseline.why}</p>
      )}
      {p.checks.length === 0 && !(p.baseline?.none && p.doneDay !== null) && (
        <p className={styles.emptyLine}>{p.stopped ? t("projects.stoppedBeforeMeasured") : t("projects.checksOpen", { days })}</p>
      )}
      {p.checks.map((c) => <Check key={c.check} p={p} c={c} />)}
    </section>
  );
}

function Check({ p, c }: { p: ReducedProject; c: CheckDue }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const m = p.measures.find((x) => x.check === c.check);
  const isOpen = S.day >= c.opensDay;
  const v = num(value);
  const preview = v !== null ? verdictOf(p.baseline, v, S.rules.tolerancePct) : null;

  return (
    <div className={styles.check} role="group" aria-label={t("projects.checkName", { check: c.check })}>
      <div className={styles.checkHead}>
        <span className={styles.strong}>{t("projects.checkName", { check: c.check })}</span>
        <span className={styles.muted}>{t("projects.checkDates", { opens: f(c.opensDay), due: f(c.dueDay) })}</span>
        {c.late && <span className={styles.due} data-late="true">{p.escalated?.what === "measure" ? t("projects.checkLateWith", { name: p.escalated.to }) : t("projects.checkLate")}</span>}
      </div>
      {m ? (
        <div className={styles.result}>
          <span className={styles.big}>{movement(p.baseline, m, locale)}</span>
          <VerdictChip verdict={m.verdict} />
          {m.changePct !== null && <span className={styles.change} data-verdict={m.verdict}>{changeText(m.changePct, locale)}</span>}
          <span className={styles.muted}>{(m.source ? m.source + " · " : "") + t("projects.recorded", { day: f(m.day), name: m.by })}</span>
        </div>
      ) : !isOpen ? (
        <p className={styles.muted}>{t("projects.opensDay", { day: f(c.opensDay) })}</p>
      ) : r.measure(c.check) ? (
        <form className={styles.measureForm} aria-label={t("projects.recordCheck", { check: c.check })}
          onSubmit={(e) => { e.preventDefault(); if (send("project.measured", { check: c.check, value: v ?? Number.NaN }, () => act.project.measure(p.id, c.check, v as number, source.trim()))) { setValue(""); setSource(""); } }}>
          <label className="nh-field">
            <span className="nh-label">{t("projects.numberNow")}{p.baseline && !p.baseline.none && p.baseline.unit ? " (" + p.baseline.unit + ")" : ""}</span>
            <input className={`nh-input ${styles.input}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className={`nh-field ${styles.grow}`}>
            <span className="nh-label">{t("projects.source")}</span>
            <input className={`nh-input ${styles.input}`} value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("projects.baselineSource")} />
          </label>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={v === null}>{t("projects.move_measure")}</button>
          {preview && (
            <span className={styles.preview} role="status">
              {t("projects.readsAs")} <VerdictChip verdict={preview.verdict} /> {changeText(preview.changePct, locale)}
            </span>
          )}
        </form>
      ) : (
        <p className={styles.muted}>{t("projects.openSince", { day: f(c.opensDay) })}</p>
      )}
    </div>
  );
}

export function RewardPanel({ p }: { p: ReducedProject }) {
  const { act, S, f, persona, actorUserId } = useDemo();
  const t = useT();
  const locale = useLocale();
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
        <h2 id={"reward-" + p.id} className={styles.h2}>{t("projects.rewardTitle")}</h2>
        <span className={styles.muted}>{t("projects.rewardSub")}</span>
      </div>
      {p.reward ? (
        <div className={styles.baseline}>
          <div className={styles.strong}>{p.reward.amount !== null ? euros(p.reward.amount, locale) : p.reward.rule === "thanks" ? t("projects.ruleThanks") : p.reward.rule}</div>
          <div className={styles.muted}>{t("projects.rewardRecorded", { day: f(p.reward.day), name: p.reward.by })}{p.reward.note ? ": " + p.reward.note : ""}</div>
          {p.claimed ? (
            <div className={styles.muted}>{t("projects.rewardClaimed", { day: f(p.claimed.day) })}</div>
          ) : r.claim ? (
            <div className={styles.claim}>
              <span>{handle && actorUserId !== null && p.authorUserIds.includes(actorUserId) ? t("projects.claimAnon", { handle }) : t("projects.claimPlain")}</span>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => send("project.claimed", {}, () => act.project.claim(p.id))}>{t("projects.claimBtn")}</button>
            </div>
          ) : null}
        </div>
      ) : rule.kind === "none" ? (
        <p className={styles.emptyLine}>{t("projects.rewardNone")}</p>
      ) : r.reward ? (
        <form className={styles.form} aria-label={t("projects.move_reward")}
          onSubmit={(e) => { e.preventDefault(); const a = takesAmount ? num(shown) : null; send("project.rewarded", {}, () => act.project.reward(p.id, rule.kind, a ?? undefined, note.trim() || undefined)); }}>
          <div className={styles.due}>{t("projects.rewardDueYours", { rule: rewardRuleText(rule, locale) })}</div>
          {rule.kind === "share" && (
            <label className="nh-field">
              <span className="nh-label">{t("projects.yearlySaving")}</span>
              <input className={`nh-input ${styles.input}`} inputMode="decimal" value={saving} onChange={(e) => { setSaving(e.target.value); setAmount(null); }} />
            </label>
          )}
          {takesAmount && (
            <label className="nh-field">
              <span className="nh-label">{t("projects.amount")}{suggested !== null ? " - " + t("projects.ruleSuggests", { amount: euros(suggested, locale) }) : ""}</span>
              <input className={`nh-input ${styles.input}`} inputMode="decimal" value={shown} onChange={(e) => setAmount(e.target.value)} />
            </label>
          )}
          <label className="nh-field">
            <span className="nh-label">{t("projects.noteOptional")}</span>
            <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("projects.notePlaceholder")} />
          </label>
          <span className={styles.actionRow}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projects.move_reward")}</button></span>
        </form>
      ) : (
        <p className={styles.emptyLine}>{t("projects.rewardDueCompany", { rule: rewardRuleText(rule, locale) })}</p>
      )}
    </section>
  );
}
