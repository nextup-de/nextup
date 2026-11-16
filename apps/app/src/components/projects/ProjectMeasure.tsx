"use client";
// Honest before vs. after (docs/plans/2026-10-15_idea-to-project.md §4-5): the baseline before the
// start - or "no number possible" and why -, the checks 30 and 90 days after done with the verdict the
// numbers give (shown when worse too), and the reward by the company's own rule.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Pill } from "@/components/dashboard/shared/primitives";
import { Fold } from "@/components/ui/elements";
import { newId, type EventPayload } from "@/features/cases/events";
import { CONFIRM_DAYS } from "@/features/projects/confirm";
import { suggestedReward } from "@/features/loop/rules";
import { parseKpiCsv } from "@/features/projects/measure-import";
import type { MeasureImpact } from "@/features/projects/measure-source";
import type { CheckDue, Measure, ReducedProject } from "@/features/projects/types";
import { verdictOf } from "@/features/projects/verdict";
import { baselineText, betterText, changeText, euros, fmtNumber, impactLines, measureShown, measureSourceLine, movement, rewardRuleText, rewardShown, type BaselineHint } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { appendEventAction } from "@/server/actions/events";
import { importMeasuresAction, type ImportCode } from "@/server/actions/measures";
import { measureView, type MeasureFlags } from "@/features/projects/measure-view";
import { QUESTION_WHY_MAX } from "@/features/projects/result";
import { idViewerOf, useRights, useSend, VerdictChip } from "./parts";
import styles from "./Projects.module.css";

const num = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function BaselinePanel({ p, hint }: { p: ReducedProject; hint: BaselineHint | null }) {
  const ctx = useDemo();
  const { act, f, S, serverMode, tenant, showToast, actorUserId } = ctx;
  const t = useT();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const router = useRouter();
  const b = p.baseline;
  // Where a reward is possible the number waits for a second person before the start (plan RES, D16).
  const bv = measureView(p, S, idViewerOf(ctx), S.day, locale).baseline;
  const confirmBaseline = () => {
    const payload: EventPayload = bv.revisionId ? { baselineEventId: bv.revisionId } : {};
    send("project.baseline.confirmed", payload, () => {
      if (!serverMode) { act.project.confirmBaseline(p.id); return; }
      void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.baseline.confirmed", target: p.id, payload }).then((res) => {
        if (res.ok) router.refresh(); else showToast(res.error);
      });
    });
  };
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
      {b && (
        <div className={styles.baseline}>
          <div className={styles.big}>{b.none ? t("projects.noNumberPossible") : fmtNumber(b.value, locale) + (b.unit ? " " + b.unit : "")}</div>
          <div className={styles.muted}>{b.none ? b.why : baselineText(b, locale).split(" · ").slice(1).join(" · ") + (b.source ? " · " + t("projects.baselineSourceIs", { source: b.source }) : "")}</div>
          {r.baseline && !editing && <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>{t("projects.takeAgain")}</button>}
        </div>
      )}
      {b && !b.none && bv.confirmed && (
        <p className={styles.muted} data-testid="baseline-confirmed">{t("projectResult.baselineConfirmed", { name: bv.confirmed.byName, date: f(bv.confirmed.day) })}</p>
      )}
      {b && bv.needsConfirm && (
        <div data-testid="baseline-waits">
          <p className={styles.muted}>{t("projectResult.baselineWaits")}</p>
          {bv.canConfirm
            ? <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" data-testid="baseline-confirm" onClick={confirmBaseline}>{t("projectResult.baselineConfirm")}</button>
            : actorUserId !== null && (actorUserId === p.leadUserId || actorUserId === b.byUserId) && <p className={styles.muted}>{t("projectResult.baselineNotYou")}</p>}
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
  const ctx = useDemo();
  const { S } = ctx;
  const t = useT();
  const view = measureView(p, S, idViewerOf(ctx), S.day);
  if (!measureShown(S.rules)) return null;
  const noNumber = p.baseline?.none === true && p.doneDay !== null;
  const stoppedFirst = p.checks.length === 0 && !noNumber && p.stopped !== null;
  // Nothing empty is drawn (DESIGN_RULES §1): without a check, a stop or a "no number possible" the panel has nothing to say.
  if (p.checks.length === 0 && !noNumber && !stoppedFirst) return null;
  return (
    <section className={styles.panel} aria-labelledby={"measure-" + p.id}>
      <h2 id={"measure-" + p.id} className={styles.h2}>{t("projects.measureTitle")}</h2>
      {noNumber && <p className={styles.emptyLine}>{t("projects.notMeasuredNoNumber")} {p.baseline?.none ? p.baseline.why : ""}</p>}
      {stoppedFirst && <p className={styles.emptyLine}>{t("projects.stoppedBeforeMeasured")}</p>}
      {p.checks.map((c) => <Check key={c.check} p={p} c={c} flags={view.measures.find((x) => x.check === c.check)} />)}
    </section>
  );
}

const IMPORT_ERR: Record<ImportCode, "projects.importErr_tooLarge" | "projects.importErr_noRows" | "projects.importErr_noMetric" | "projects.importErr_notAllowed" | "projects.importErr_closedCheck"> = {
  "too-large": "projects.importErr_tooLarge",
  "no-rows": "projects.importErr_noRows",
  "no-metric": "projects.importErr_noMetric",
  "not-allowed": "projects.importErr_notAllowed",
  "closed-check": "projects.importErr_closedCheck",
};

const IMPACT_FIELDS = [
  ["savingEurPerYear", "projects.impactSavingField"],
  ["co2KgPerYear", "projects.impactCo2Field"],
  ["energyKwhPerYear", "projects.impactEnergyField"],
  ["scrapPartsPerYear", "projects.impactScrapField"],
] as const;

function Check({ p, c, flags }: { p: ReducedProject; c: CheckDue; flags: MeasureFlags | undefined }) {
  const { act, S, f, serverMode, tenant, seed, showToast } = useDemo();
  const t = useT();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const router = useRouter();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [impact, setImpact] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [backWhy, setBackWhy] = useState("");
  const [importMsg, setImportMsg] = useState<string[]>([]);
  const m = p.measures.find((x) => x.check === c.check);
  // A number that was sent back is not a result: the lead enters the check again (RES D14).
  const resultStands = m !== undefined && !m.sentBack;
  const lastQuestion = m?.questions[m.questions.length - 1];
  const unit = p.baseline && !p.baseline.none && p.baseline.unit ? " " + p.baseline.unit : "";
  const isOpen = S.day >= c.opensDay;
  const mayRecord = isOpen && !resultStands && r.measure(c.check);
  // One date per row (DESIGN_RULES §9): when it opens before that, when it is due while it waits for its number, none once a number stands.
  const date = !isOpen ? t("projects.checkOpens", { day: f(c.opensDay) }) : !resultStands ? t("projects.checkDue", { day: f(c.dueDay) }) : null;
  const canConfirm = resultStands && !m.confirmed && r.confirm(c.check);
  const v = num(value);
  const preview = v !== null ? verdictOf(p.baseline, v, S.rules.tolerancePct) : null;
  const label = (userId: string | null, fallback: string) => seed.seats.find((s) => s.userId === userId)?.label ?? fallback;

  const impactOf = (): MeasureImpact | null | "bad" => {
    const out: MeasureImpact = {};
    for (const [key] of IMPACT_FIELDS) {
      const raw = impact[key] ?? "";
      if (raw.trim() === "") continue;
      const n = num(raw);
      if (n === null || n < 0) return "bad";
      out[key] = n;
    }
    return Object.keys(out).length ? out : null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const figures = serverMode ? impactOf() : null;
    if (figures === "bad") { showToast(t("projects.impactBad")); return; }
    const source = { kind: "typed" as const, ...(note.trim() ? { note: note.trim() } : {}) };
    const payload: EventPayload = { check: c.check, value: v ?? Number.NaN, source, ...(figures ? { impact: figures } : {}), ...(m?.sentBack && m.eventId ? { measureEventId: m.eventId } : {}) };
    const went = send("project.measured", payload, () => {
      if (!serverMode) { act.project.measure(p.id, c.check, v as number, note.trim()); return; }
      void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.measured", target: p.id, payload }).then((res) => {
        if (res.ok) router.refresh(); else showToast(res.error);
      });
    });
    if (went) { setValue(""); setNote(""); setImpact({}); }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try { text = await file.text(); } catch { setImportMsg([t("projects.importErr_unreadable")]); return; }
    const lineErrors = parseKpiCsv(text).errors.map((e) => t("projects.importLineError", { line: e.line, reason: e.reason }));
    const res = await importMeasuresAction(tenant.slug, p.id, c.check, { name: file.name, text });
    if (res.ok) {
      setImportMsg([t("projects.importOk", { value: fmtNumber(res.value, locale), date: res.date }), ...lineErrors]);
      router.refresh();
    } else {
      setImportMsg([t(IMPORT_ERR[res.code]), ...lineErrors]);
    }
  };

  const sendBack = (x: Measure) => {
    const why = backWhy.trim();
    if (!why) return;
    const payload: EventPayload = { check: x.check, why, ...(x.eventId ? { measureEventId: x.eventId } : {}) };
    const went = send("project.measure.questioned", payload, () => {
      if (!serverMode) { act.project.question(p.id, x.check, why); return; }
      void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.measure.questioned", target: p.id, payload }).then((res) => {
        if (res.ok) router.refresh(); else showToast(res.error);
      });
    });
    if (went) { setSendingBack(false); setBackWhy(""); }
  };

  // One click (Kevin, 16 Nov 2026): the button's title says what confirming means.
  const confirm = (x: Measure) => {
    const payload: EventPayload = { check: x.check, ...(x.eventId ? { measureEventId: x.eventId } : {}) };
    send("project.measure.confirmed", payload, () => {
      if (!serverMode) { act.project.confirmMeasure(p.id, x.check, x.eventId); return; }
      void appendEventAction({ slug: tenant.slug, id: newId("e"), type: "project.measure.confirmed", target: p.id, payload }).then((res) => {
        if (res.ok) router.refresh(); else showToast(res.error);
      });
    });
  };

  const checkName = t("projects.checkName", { check: c.check });
  return (
    <div className={styles.check} role="group" aria-label={checkName}>
      {/* One row (Kevin, 16 Nov 2026): the check, its number or its one date, one chip, and for who may confirm one filled button. */}
      <div className={styles.checkHead}>
        <span className={styles.strong}>{checkName}</span>
        {resultStands ? (
          <>
            <span className={styles.movement}>{movement(p.baseline, m, locale)}</span>
            {m.changePct !== null && <span className={styles.change} data-verdict={m.verdict}>{changeText(m.changePct, locale)}</span>}
            {m.confirmed ? <VerdictChip verdict={m.verdict} /> : <span data-testid={"measure-waiting-" + c.check}><Pill tone="soft">{t("projects.verdictNotConfirmed")}</Pill></span>}
            {canConfirm && (
              <button type="button" className={`nh-btn nh-btn-primary nh-btn-sm ${styles.checkMove}`} data-testid={"measure-confirm-" + c.check} title={t("projects.confirmAsk")} onClick={() => confirm(m)}>{t("projects.confirmResult")}</button>
            )}
          </>
        ) : (
          <>
            {date && <span className={styles.muted}>{date}</span>}
            {isOpen && c.late && <span className={styles.due} data-late="true">{p.escalated?.what === "measure" ? t("projects.checkLateWith", { name: p.escalated.to }) : t("projects.checkLate")}</span>}
          </>
        )}
      </div>
      {m?.sentBack && (
        <p className={styles.checkLine} data-testid={"measure-sentback-" + c.check}>{t("projectResult.measureSentBack", { date: f(lastQuestion?.day ?? m.day), why: lastQuestion?.why ?? "" })}</p>
      )}
      {mayRecord && (
        <form className={styles.measureForm} aria-label={t("projects.recordCheck", { check: c.check })} onSubmit={submit}>
          <label className="nh-field">
            <span className="nh-label">{t("projects.numberNow")}{unit ? " (" + unit.trim() + ")" : ""}</span>
            <input className={`nh-input ${styles.input}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={v === null}>{t("projects.recordShort")}</button>
          {serverMode && (
            <button type="button" className={styles.quietLink} data-testid={"measure-import-" + c.check} aria-expanded={importing} onClick={() => setImporting(!importing)}>{t("projects.importFromFile")}</button>
          )}
          {preview && (
            <span className={styles.preview} role="status">
              {t("projects.readsAs")} <VerdictChip verdict={preview.verdict} /> {changeText(preview.changePct, locale)}
            </span>
          )}
          <div className={styles.foldRow}>
            <Fold summary={t(serverMode ? "projects.impactAndNote" : "projects.noteSummary")} name={"measure-more-" + c.check}>
              <label className={`nh-field ${styles.grow}`}>
                <span className="nh-label">{t("projects.noteField")}</span>
                <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("projects.baselineSource")} />
              </label>
              {serverMode && IMPACT_FIELDS.map(([key, msg]) => (
                <label key={key} className="nh-field">
                  <span className="nh-label">{t(msg)}</span>
                  <input className={`nh-input ${styles.input}`} inputMode="decimal" value={impact[key] ?? ""} onChange={(e) => setImpact({ ...impact, [key]: e.target.value })} />
                </label>
              ))}
            </Fold>
          </div>
        </form>
      )}
      {mayRecord && importing && serverMode && (
        <div className={styles.measureForm}>
          <label className={`nh-field ${styles.grow}`}>
            <span className="nh-label">{t("projects.importFileLabel")}</span>
            <input className={`nh-input ${styles.input}`} type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { const input = e.target; void importFile(input.files?.[0]).then(() => { input.value = ""; }); }} />
          </label>
          {importMsg.length > 0 && <ul className={styles.muted} role="status">{importMsg.map((line, i) => <li key={i}>{line}</li>)}</ul>}
        </div>
      )}
      {resultStands && (
        // Who typed it, its deadline, the impact, the history and "Send it back" wait behind one fold (DESIGN_RULES §9).
        <Fold summary={t("projects.checkDetails")} name={"measure-details-" + c.check}>
          <span className={styles.muted} data-testid={"measure-source-" + c.check}>
            {m.sourceInfo.kind === "typed" && !m.confirmed
              ? t("projects.srcTypedBy", { role: label(m.byUserId, m.by) })
              : measureSourceLine(m, { by: label(m.byUserId, m.by), confirmedBy: label(m.confirmedByUserId, ""), day: f }, t)}
          </span>
          {/* A second person has CONFIRM_DAYS working days (decision Q6.15); a number from a system needs nobody. */}
          {!m.confirmed && serverMode && m.sourceKind !== "system" && (
            <span className={styles.muted} data-testid={"measure-deadline-" + c.check}>
              {S.day > m.day + CONFIRM_DAYS ? t("projects.verdictWaitingLate", { day: f(m.day + CONFIRM_DAYS) }) : t("projects.verdictWaiting", { day: f(m.day + CONFIRM_DAYS) })}
            </span>
          )}
          {impactLines(m.impact, locale).map((line) => <span key={line} className={styles.muted}>{line}</span>)}
          {m.questions.map((q, i) => <span key={i} className={styles.muted}>{t("projectResult.measureSentBack", { date: f(q.day), why: q.why })}</span>)}
          {m.reentered && m.previous.length > 0 && (
            <span className={styles.muted} data-testid={"measure-reentered-" + c.check}>
              {t("projectResult.measureReentered", { date: f(m.day), value: fmtNumber(m.previous[m.previous.length - 1].value, locale) + unit })}
            </span>
          )}
          {m.managerOnly && !m.confirmed && <span className={styles.muted} data-testid={"measure-manageronly-" + c.check}>{t("projectResult.measureManagerOnly")}</span>}
          {flags?.canQuestion && !m.confirmed && (
            sendingBack ? (
              <form className={styles.actionRow} aria-label={t("projectResult.measureSendBack")} onSubmit={(e) => { e.preventDefault(); sendBack(m); }}>
                <label className="nh-field">
                  <span className="nh-label">{t("projectResult.measureSendBackWhy")}</span>
                  <input className={`nh-input ${styles.input}`} value={backWhy} maxLength={QUESTION_WHY_MAX} onChange={(e) => setBackWhy(e.target.value)} autoFocus />
                </label>
                <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!backWhy.trim()}>{t("projectResult.measureSendBack")}</button>
                <button type="button" className={styles.quiet} onClick={() => { setSendingBack(false); setBackWhy(""); }}>{t("common.cancel")}</button>
              </form>
            ) : (
              <span><button type="button" className={styles.quiet} data-testid={"measure-sendback-" + c.check} onClick={() => setSendingBack(true)}>{t("projectResult.measureSendBack")}</button></span>
            )
          )}
        </Fold>
      )}
    </div>
  );
}

export function RewardPanel({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const { act, S, f, persona, actorUserId } = ctx;
  const t = useT();
  const locale = useLocale();
  const r = useRights(p);
  const send = useSend(p);
  const rule = S.rules.reward;
  const [saving, setSaving] = useState("");
  const [amount, setAmount] = useState<string | null>(null); // null: still the rule's suggestion
  const [note, setNote] = useState("");
  if (!rewardShown(S.rules)) return null;
  const waiting = !p.reward && !p.rewardDue && rule.kind !== "none" && p.doneDay !== null && !p.stopped;
  if (!p.reward && !p.rewardDue && !waiting && !(p.status === "measured" && rule.kind === "none")) return null;

  const suggested = suggestedReward(rule, num(saving));
  const takesAmount = rule.kind === "fixed" || rule.kind === "share";
  const shown = amount ?? (suggested !== null ? String(suggested) : "");
  const handle = persona.who.handle;
  // While a reward is due, recognition is due by a date (D17).
  const recognitionDay = measureView(p, S, idViewerOf(ctx), S.day).recognitionDueDay;

  return (
    <section className={styles.panel} aria-labelledby={"reward-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"reward-" + p.id} className={styles.h2}>{t("projects.rewardTitle")}</h2>
        <span className={styles.muted}>{t("projects.rewardSub")}</span>
      </div>
      {!p.reward && recognitionDay !== null && <p className={styles.muted} data-testid="recognition-due">{t("projectResult.recognitionDue", { date: f(recognitionDay) })}</p>}
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
      ) : waiting ? (
        <p className={styles.emptyLine}>{t("projects.rewardNotDueYet")}</p>
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
