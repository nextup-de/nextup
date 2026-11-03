"use client";
// /settings/company: name, mark and the profile. Props in, the action out; no fetching here.
import { useActionState, useState } from "react";
import { useFormat, useT } from "@/i18n/client";
import type { CompanyForm as Values } from "@/features/settings/company-forms";
import type { LastSaved } from "@/features/settings/last-saved";
import { saveCompanyAction, type SettingsFormState } from "@/server/actions/settings/company";
import { Card, Foot, Row } from "./SettingsParts";
import s from "./settings.module.css";

/** Principles as chips; the form still sends them one per line. */
function Principles({ initial, invalid }: { initial: string[]; invalid: boolean }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const add = () => {
    const v = (draft ?? "").trim();
    if (v && !items.includes(v)) setItems([...items, v]);
    setDraft(null);
  };
  return (
    <div className={s.chips}>
      <input type="hidden" name="principles" value={items.join("\n")} data-testid="settings-company-principles" />
      {items.map((p) => (
        <span key={p} className={s.chip}>
          {p}
          <button type="button" className={s.chipX} aria-label={t("settingsCompany.removeItem", { name: p })} onClick={() => setItems(items.filter((x) => x !== p))}>×</button>
        </span>
      ))}
      {draft === null ? (
        <button type="button" className={s.dashed} onClick={() => setDraft("")} data-testid="settings-company-principle-add">{t("settingsCompany.addPrinciple")}</button>
      ) : (
        <input
          className={`${s.input} ${s.chipInput}`}
          autoFocus
          value={draft}
          placeholder={t("settingsCompany.newPrinciple")}
          aria-label={t("settingsCompany.newPrinciple")}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Escape") setDraft(null);
          }}
        />
      )}
    </div>
  );
}

export function CompanyForm({ slug, values, address, demo, lastSaved }: { slug: string; values: Values; address: string; demo?: boolean; lastSaved?: LastSaved | null }) {
  const t = useT();
  const format = useFormat();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveCompanyAction, {});
  const [mark, setMark] = useState(values.mark);
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  const p = values.profile;
  const formError = state.error && !state.field ? t(state.error) : undefined;
  const saved = lastSaved ? t("settingsCompany.lastSaved", { date: format.date(lastSaved.at, "dayMonth"), name: lastSaved.name ?? t(lastSaved.kindKey) }) : undefined;
  const status = formError ?? (state.ok ? t("settingsCompany.saved") : demo ? t("settingsCompany.demoData") : saved);
  const save = (tid?: string) => (
    <button className={s.save} type="submit" disabled={pending || demo} data-testid={tid}>
      {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
    </button>
  );
  return (
    <form action={act} className={s.page} data-testid="settings-company-form">
      <input type="hidden" name="slug" value={slug} />
      <Card title={t("settingsCompany.cardBasics")}>
        <Row id="name" label={t("settingsCompany.name")} error={err("name")}>
          <input className={s.input} id="name" name="name" defaultValue={values.name} required aria-invalid={Boolean(err("name")) || undefined} data-testid="settings-company-name" />
        </Row>
        <Row label={t("settingsCompany.address")}>
          <span className={s.mono}>{address}</span>
        </Row>
        <Row id="mark" label={t("settingsCompany.mark")} top help={t("settingsCompany.markHint")} error={err("mark")}>
          <div className={s.inline}>
            <span className={s.markTile} aria-hidden="true">{mark.trim() || "·"}</span>
            <input className={s.input} data-size="money" id="mark" name="mark" value={mark} maxLength={8} onChange={(e) => setMark(e.target.value)} aria-invalid={Boolean(err("mark")) || undefined} data-testid="settings-company-mark" />
          </div>
        </Row>
        <Foot>{save()}</Foot>
      </Card>
      <Card title={t("settingsCompany.cardAbout")} hint={t("settingsCompany.aboutHint")}>
        <Row id="vision" label={t("settingsCompany.vision")} top error={err("vision")}>
          <textarea className={s.input} id="vision" name="vision" rows={2} defaultValue={p.vision} data-testid="settings-company-vision" />
        </Row>
        <Row id="mission" label={t("settingsCompany.mission")} top error={err("mission")}>
          <textarea className={s.input} id="mission" name="mission" rows={2} defaultValue={p.mission} data-testid="settings-company-mission" />
        </Row>
        <Row label={t("settingsCompany.principles")} error={err("principles")}>
          <Principles initial={p.principles} invalid={Boolean(err("principles"))} />
        </Row>
        <Row id="businessModel" label={t("settingsCompany.businessModel")} top error={err("businessModel")}>
          <textarea className={s.input} id="businessModel" name="businessModel" rows={3} defaultValue={p.businessModel} data-testid="settings-company-business-model" />
        </Row>
        <Row id="complianceRules" label={t("settingsCompany.complianceRules")} top help={t("settingsCompany.complianceHint")} error={err("complianceRules")}>
          <textarea className={s.input} id="complianceRules" name="complianceRules" rows={3} defaultValue={p.complianceRules} data-testid="settings-company-compliance" />
        </Row>
        <Foot status={status} tone={formError ? "error" : undefined} statusTestId={formError ? "settings-company-error" : state.ok ? "settings-company-saved" : undefined}>
          {save("settings-company-save")}
        </Foot>
      </Card>
    </form>
  );
}
