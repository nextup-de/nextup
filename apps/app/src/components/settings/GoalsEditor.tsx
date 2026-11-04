"use client";
// The goals card of /settings/rules: company-wide goals first, then the goals of each unit in tree
// order. A drawer edits one goal; every change calls an action from server/actions/settings/goals.ts.
import { useState, useTransition, type FormEvent } from "react";
import type { GoalRow, UnitRow } from "@/features/knowledge";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { addGoalAction, removeGoalAction, updateGoalAction, type GoalResult } from "@/server/actions/settings/goals";
import { DeptChip } from "@/components/ui/elements";
import styles from "./GoalsEditor.module.css";

type Props = { slug: string; goals: GoalRow[]; units: UnitRow[] };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Units in tree order with their depth. */
function unitTree(units: readonly UnitRow[]): { unit: UnitRow; depth: number }[] {
  const ids = new Set(units.map((u) => u.id));
  const out: { unit: UnitRow; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (u: UnitRow, depth: number) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ unit: u, depth });
    units.filter((c) => c.parentId === u.id).forEach((c) => walk(c, depth + 1));
  };
  units.filter((u) => !u.parentId || !ids.has(u.parentId)).forEach((u) => walk(u, 0));
  units.forEach((u) => walk(u, 0));
  return out;
}

export function GoalsEditor({ slug, goals, units }: Props) {
  const t = useT();
  const [open, setOpen] = useState<GoalRow | "new" | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const tree = unitTree(units);
  const byScope = (unitId: string | null) => goals.filter((g) => g.orgUnitId === unitId).sort((a, b) => a.sort - b.sort);
  const known = new Set(units.map((u) => u.id));
  const groups = [
    { key: "company", label: t("settingsGoals.companyWide"), rows: goals.filter((g) => g.orgUnitId === null || !known.has(g.orgUnitId)).sort((a, b) => a.sort - b.sort) },
    ...tree.map(({ unit }) => ({ key: unit.id, label: unit.name, rows: byScope(unit.id) })),
  ].filter((g) => g.rows.length > 0);

  const run = (call: () => Promise<GoalResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      setSaved(r.ok);
      if (r.ok) after?.();
    });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const goal = {
      title: text(f, "title"), kpi: text(f, "kpi"), target: text(f, "target"), period: text(f, "period"),
      orgUnitId: text(f, "orgUnitId") || null,
      keywords: text(f, "keywords").split(",").map((k) => k.trim()).filter(Boolean),
    };
    run(() => (open === "new" || open === null ? addGoalAction(slug, goal) : updateGoalAction(slug, open.id, goal)), () => setOpen(null));
  };

  const editing = open && open !== "new" ? open : null;
  return (
    <section className={styles.wrap} data-testid="settings-rules-goals">
      <div className={styles.head}>
        <h2 className={styles.title}>{t("settingsGoals.title")}</h2>
        <button className="nh-btn nh-btn-primary nh-btn-sm" type="button" data-testid="settings-rules-goal-add"
          onClick={() => { setError(null); setSaved(false); setOpen("new"); }}>{t("settingsGoals.add")}</button>
      </div>
      <p className="nh-hint">{t("settingsGoals.hint")}</p>
      {error && !open ? <p className="nh-error" role="alert" data-testid="settings-rules-goal-error">{t(error)}</p> : null}
      {saved && !error ? <p className="nh-hint" role="status" data-testid="settings-rules-goal-saved">{t("settingsGoals.saved")}</p> : null}
      {goals.length === 0 ? <p className="nh-hint" data-testid="settings-rules-goal-empty">{t("settingsGoals.empty")}</p> : null}

      {groups.map((group) => (
        <div key={group.key}>
          <h3 className={styles.scope}>{group.key === "company" ? group.label : <DeptChip name={group.label} />}</h3>
          <ul className={styles.list}>
            {group.rows.map((g) => (
              <li key={g.id} className={styles.row} data-testid={`settings-rules-goal-${g.id}`}>
                <div className={styles.rowHead}>
                  <strong data-testid="settings-rules-goal-title">{g.title}</strong>
                  <span className={styles.buttons}>
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-rules-goal-edit"
                      onClick={() => { setError(null); setSaved(false); setOpen(g); }}>{t("settingsGoals.edit")}</button>
                    {confirming === g.id ? (
                      <>
                        <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-rules-goal-delete-yes"
                          onClick={() => run(() => removeGoalAction(slug, g.id), () => setConfirming(null))}>{t("settingsGoals.removeYes")}</button>
                        <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setConfirming(null)}>{t("settingsGoals.cancel")}</button>
                      </>
                    ) : (
                      <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={pending} data-testid="settings-rules-goal-delete"
                        onClick={() => setConfirming(g.id)}>{t("settingsGoals.remove")}</button>
                    )}
                  </span>
                </div>
                {[g.kpi, g.target, g.period].some(Boolean) ? <span className="nh-hint">{[g.kpi, g.target, g.period].filter(Boolean).join(" · ")}</span> : null}
                {g.keywords.length ? <span className="nh-hint">{g.keywords.join(", ")}</span> : null}
                {confirming === g.id ? <span className="nh-hint" role="alert">{t("settingsGoals.removeConfirm")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {open ? (
        <form key={editing?.id ?? "new"} className={styles.drawer} role="dialog" aria-label={t(editing ? "settingsGoals.drawerEdit" : "settingsGoals.drawerAdd")}
          onSubmit={submit} data-testid="settings-rules-goal-drawer">
          <h3 className={styles.title}>{t(editing ? "settingsGoals.drawerEdit" : "settingsGoals.drawerAdd")}</h3>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldTitle")}</span>
            <input className="nh-input" name="title" required maxLength={120} defaultValue={editing?.title ?? ""} data-testid="settings-rules-goal-field-title" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldKpi")}</span>
            <input className="nh-input" name="kpi" defaultValue={editing?.kpi ?? ""} data-testid="settings-rules-goal-field-kpi" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldTarget")}</span>
            <input className="nh-input" name="target" defaultValue={editing?.target ?? ""} data-testid="settings-rules-goal-field-target" /></label>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldPeriod")}</span>
            <input className="nh-input" name="period" defaultValue={editing?.period ?? ""} data-testid="settings-rules-goal-field-period" />
            <span className="nh-hint">{t("settingsGoals.fieldPeriodHint")}</span></label>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldAppliesTo")}</span>
            <select className="nh-select" name="orgUnitId" defaultValue={editing?.orgUnitId ?? ""} data-testid="settings-rules-goal-field-unit">
              <option value="">{t("settingsGoals.companyWide")}</option>
              {tree.map(({ unit, depth }) => <option key={unit.id} value={unit.id}>{"– ".repeat(depth) + unit.name}</option>)}
            </select></label>
          <label className="nh-field"><span className="nh-label">{t("settingsGoals.fieldKeywords")}</span>
            <input className="nh-input" name="keywords" defaultValue={editing?.keywords.join(", ") ?? ""} data-testid="settings-rules-goal-field-keywords" />
            <span className="nh-hint">{t("settingsGoals.fieldKeywordsHint")}</span></label>
          {error ? <p className="nh-error" role="alert" data-testid="settings-rules-goal-error">{t(error)}</p> : null}
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-rules-goal-save">{t("settingsGoals.save")}</button>
            <button className="nh-btn nh-btn-ghost" type="button" onClick={() => setOpen(null)} data-testid="settings-rules-goal-cancel">{t("settingsGoals.cancel")}</button>
          </span>
        </form>
      ) : null}
    </section>
  );
}
