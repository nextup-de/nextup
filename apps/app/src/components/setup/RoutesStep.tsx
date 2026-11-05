"use client";
// Setup step 4: the routes, reduced to request type, keywords and owner role as Paper has it. Deputy,
// buddy and wait stay on Settings -> Routing, and an edit here keeps what they hold.
import { useState, type FormEvent } from "react";
import type { Knowledge, RuleRow } from "@/features/knowledge";
import { routeKeyFor, seatLine } from "@/features/settings/routing-view";
import { useT } from "@/i18n/client";
import { saveRouteAction } from "@/server/actions/settings/org";
import { KeywordInput } from "@/components/settings/RoutingEditor";
import settings from "@/components/settings/settings.module.css";
import { Added, AddedRow, Field, Refusal, StepCard, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

const words = (v: string) => v.split(",").map((w) => w.trim()).filter(Boolean);

export function RoutesStep({ slug, formId, onDirty, demo, knowledge: k }: StepFormProps & { knowledge: Knowledge }) {
  const t = useT();
  const { error, pending, run, clear } = useRun();
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [round, setRound] = useState(0); // a new round gives an empty form
  const finish = () => { setEditing(null); setRound((n) => n + 1); onDirty(false); };
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const title = (id: string) => k.roles.find((r) => r.id === id)?.title ?? "";

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) ?? "").trim();
    const type = text("type");
    const owner = text("owner");
    run(() => saveRouteAction(slug, {
      key: editing ? editing.key : routeKeyFor(type, k.rules.map((x) => x.key)),
      type,
      keywords: words(text("keywords")),
      ownerRoleId: owner === "" ? null : owner,
      deputyRoleId: editing?.deputyRoleId ?? null,
      buddyRoleId: editing?.buddyRoleId ?? null,
      wait: editing?.wait ?? "",
    }), finish);
  };

  return (
    <StepCard title={t("settingsSetup.cardRoutes")} text={t("settingsSetup.cardRoutesText")}>
      <p className={s.note}><span className={s.noteMark} aria-hidden="true">✦</span>{t("settingsSetup.routesAiNote")}</p>
      {k.rules.length ? (
        <Added>
          {[...k.rules].sort((a, b) => a.sort - b.sort).map((rule) => (
            <AddedRow key={rule.id} name={rule.type} sub={title(rule.ownerRoleId)} testId={`setup-route-${rule.key}`}
              onEdit={() => { clear(); setEditing(rule); setRound((n) => n + 1); }} />
          ))}
        </Added>
      ) : null}
      <form key={round} id={formId} className={s.form} onSubmit={submit} onInput={() => onDirty(true)}>
        <Field label={t("settingsOrg.routeType")}>
          <input className={settings.input} name="type" required maxLength={120} defaultValue={editing?.type ?? ""} data-testid="setup-route-type" />
        </Field>
        <div className={s.field}>
          <span className={s.fieldLabel}>{t("settingsOrg.keywords")}</span>
          <KeywordInput initial={editing?.keywords ?? []} invalid={error === "settingsOrg.errKeywords"} />
        </div>
        <Field label={t("settingsOrg.routeOwner")} help={t("settingsSetup.routeExample")}>
          <select className={settings.input} name="owner" defaultValue={editing?.ownerRoleId ?? ""} data-testid="setup-route-owner">
            <option value="">{t("settingsOrg.pickRole")}</option>
            {k.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {`${role.title} · ${unitName.get(role.orgUnitId) ?? "?"}${seatLine(k, role.id) ? "" : ` · ${t("settingsOrg.vacant")}`}`}
              </option>
            ))}
          </select>
        </Field>
        <Refusal error={error} />
        <div className={s.formFoot}>
          <span className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : ""}</span>
          <span className={s.formButtons}>
            {editing ? <button type="button" className={s.secondary} onClick={finish}>{t("settingsOrg.cancel")}</button> : null}
            <button type="submit" className={s.secondary} disabled={pending || demo} data-testid="setup-route-add">{t("settingsSetup.saveRoute")}</button>
          </span>
        </div>
      </form>
    </StepCard>
  );
}
