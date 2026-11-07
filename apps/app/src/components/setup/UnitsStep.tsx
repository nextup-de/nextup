"use client";
// Setup step 2: the units, with the tree so far above a card holding the form. It writes through the same org
// actions as Settings -> Org, and the same pure rules refuse what they refuse there.
import { useState, type FormEvent } from "react";
import type { Knowledge, UnitRow } from "@/features/knowledge";
import { UNIT_KINDS } from "@/features/org-edit";
import { unitTree } from "@/features/settings/org-view";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { addUnitAction, updateUnitAction } from "@/server/actions/settings/org";
import settings from "@/components/settings/settings.module.css";
import { Added, AddedRow, Field, Refusal, StepCard, StepSection, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

const KIND: Record<(typeof UNIT_KINDS)[number], MessageKey> = {
  board: "settingsOrg.unitKindBoard", dept: "settingsOrg.unitKindDept", team: "settingsOrg.unitKindTeam",
};
const kindOf = (kind: string): MessageKey => KIND[kind as (typeof UNIT_KINDS)[number]] ?? KIND.dept;

export function UnitsStep({ slug, formId, onDirty, demo, knowledge: k }: StepFormProps & { knowledge: Knowledge }) {
  const t = useT();
  const { error, pending, run, clear } = useRun();
  const rows = unitTree(k.units);
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [round, setRound] = useState(0); // a new round gives an empty form
  const finish = () => { setEditing(null); setRound((n) => n + 1); onDirty(false); };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) ?? "").trim();
    const parent = text("parentId");
    const unit = { name: text("name"), kind: text("kind"), headcount: Number(text("headcount") || 0), parentId: parent === "" ? null : parent };
    if (editing) { const id = editing.id; run(() => updateUnitAction(slug, id, unit), finish); }
    else run(() => addUnitAction(slug, { key: text("key").toUpperCase(), ...unit }), finish);
  };

  return (
    <>
      <StepCard title={t("settingsSetup.cardUnits")} text={t("settingsSetup.cardUnitsText")}>
        {rows.length ? (
          <Added>
            {rows.map(({ unit, depth }) => (
              <AddedRow key={unit.id} name={unit.name} depth={depth} testId={`setup-unit-${unit.key}`}
                side={<span>{t(kindOf(unit.kind))} · <span className={s.mono}>{unit.key}</span></span>}
                onEdit={() => { clear(); setEditing(unit); setRound((n) => n + 1); }} />
            ))}
          </Added>
        ) : null}
      </StepCard>
      <StepSection title={editing ? t("settingsOrg.editUnit") : t("settingsSetup.addUnitTitle")}>
        <form key={round} id={formId} className={s.form} onSubmit={submit} onInput={() => onDirty(true)}>
          <Field side label={t("settingsOrg.unitName")} help={t("settingsSetup.unitNameHelp")}>
            <input className={settings.input} name="name" required defaultValue={editing?.name ?? ""} data-testid="setup-unit-name" />
          </Field>
          {editing ? null : (
            <Field side label={t("settingsOrg.unitKey")} help={t("settingsSetup.unitKeyHelp")}>
              <input className={`${settings.input} ${s.monoInput}`} name="key" required maxLength={32} data-testid="setup-unit-key" />
            </Field>
          )}
          <div className={s.fieldSide} role="group" aria-label={t("settingsOrg.unitKind")}>
            <span className={s.fieldLabel}>{t("settingsOrg.unitKind")}</span>
            <span className={s.segment}>
              {UNIT_KINDS.map((x) => (
                <label key={x}>
                  <input type="radio" name="kind" value={x} defaultChecked={(editing?.kind ?? "dept") === x} />
                  <span>{t(KIND[x])}</span>
                </label>
              ))}
            </span>
          </div>
          <Field side label={t("settingsOrg.parentUnit")}>
            <select className={settings.input} name="parentId" defaultValue={editing ? editing.parentId ?? "" : rows[0]?.unit.id ?? ""}>
              <option value="">{t("settingsOrg.unitNoParent")}</option>
              {rows.filter((r) => r.unit.id !== editing?.id).map(({ unit, depth }) => <option key={unit.id} value={unit.id}>{"– ".repeat(depth) + unit.name}</option>)}
            </select>
          </Field>
          <Field side label={t("settingsOrg.unitHeadcount")}>
            <input className={`${settings.input} ${s.shortInput}`} name="headcount" type="number" min={0} defaultValue={editing?.headcount ?? 0} />
          </Field>
          <Refusal error={error} />
          <div className={s.formFoot}>
            <span className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : ""}</span>
            <span className={s.formButtons}>
              {editing ? <button type="button" className={s.secondary} onClick={finish}>{t("settingsOrg.cancel")}</button> : null}
              <button type="submit" className={s.secondary} disabled={pending || demo} data-testid="setup-unit-add">
                {editing ? t("settingsOrg.save") : t("settingsOrg.unitAdd")}
              </button>
            </span>
          </div>
        </form>
      </StepSection>
    </>
  );
}
