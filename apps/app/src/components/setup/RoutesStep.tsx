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
import { AddButton, Added, AddedRow, Field, Refusal, StepCard, StepDrawer, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

const words = (v: string) => v.split(",").map((w) => w.trim()).filter(Boolean);

export function RoutesStep({ slug, formId, demo, knowledge: k }: StepFormProps & { knowledge: Knowledge }) {
  const t = useT();
  const { error, pending, run, clear } = useRun();
  // The drawer: closed, open for a new route, or open on one route. Closing it drops what was typed.
  const [drawer, setDrawer] = useState<{ editing: RuleRow | null } | null>(null);
  const editing = drawer?.editing ?? null;
  const show = (rule: RuleRow | null) => { clear(); setDrawer({ editing: rule }); };
  const finish = () => setDrawer(null);
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
    <>
      <StepCard title={t("settingsSetup.cardRoutes")} text={t("settingsSetup.cardRoutesText")}
        action={<AddButton label={t("settingsOrg.addRoute")} onClick={() => show(null)} testId="setup-route-new" />}>
        <p className={s.note}><span className={s.noteMark} aria-hidden="true">✦</span>{t("settingsSetup.routesAiNote")}</p>
        {k.rules.length ? (
          <Added>
            {[...k.rules].sort((a, b) => a.sort - b.sort).map((rule) => (
              <AddedRow key={rule.id} name={rule.type} sub={title(rule.ownerRoleId)} testId={`setup-route-${rule.key}`}
                onEdit={() => show(rule)} />
            ))}
          </Added>
        ) : null}
      </StepCard>
      {drawer ? (
        <StepDrawer title={editing ? editing.type : t("settingsOrg.addRoute")} formId={formId} onClose={finish}
          submitLabel={t("settingsSetup.saveRoute")} disabled={pending || !!demo} testId="setup-route-drawer" submitTestId="setup-route-add">
          <form id={formId} className={s.form} onSubmit={submit}>
            <Field label={t("settingsOrg.routeType")}>
              <input className={settings.input} name="type" required autoFocus maxLength={120} defaultValue={editing?.type ?? ""} data-testid="setup-route-type" />
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
            {demo ? <p className={s.fieldHelp}>{t("settingsCompany.demoData")}</p> : null}
          </form>
        </StepDrawer>
      ) : null}
    </>
  );
}
