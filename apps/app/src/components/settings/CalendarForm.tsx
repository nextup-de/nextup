"use client";
// /settings/calendar: region, working days and the company's own extra holidays and working days.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { REGIONS, type CalendarSpec } from "@/features/clock";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { saveCalendarAction, type SettingsFormState } from "@/server/actions/settings/company";

const grid = { display: "grid", gap: 16, maxWidth: 640 } as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function CalendarForm({ slug, calendar }: { slug: string; calendar: CalendarSpec }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveCalendarAction, {});
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  return (
    <form action={act} style={grid} data-testid="settings-calendar-form">
      <input type="hidden" name="slug" value={slug} />
      <Field id="region" label={t("settingsCompany.region")} error={err("region")}>
        <select className="nh-input" id="region" name="region" defaultValue={calendar.region} data-testid="settings-calendar-region">
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="nh-label">{t("settingsCompany.workdays")}</legend>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {DAYS.map((d) => (
            <label key={d} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="workdays" value={String(d)} defaultChecked={calendar.workdays.includes(d)} data-testid={`settings-calendar-workday-${d}`} />
              {t(`settingsCompany.day${d}` as MessageKey)}
            </label>
          ))}
        </div>
        {err("workdays") ? <p className="nh-error" role="alert">{err("workdays")}</p> : null}
      </fieldset>
      <Field id="extraHolidays" label={t("settingsCompany.extraHolidays")} hint={t("settingsCompany.datesHint")} error={err("extraHolidays")}>
        <textarea className="nh-input" id="extraHolidays" name="extraHolidays" rows={3} defaultValue={calendar.extraHolidays.join("\n")} data-testid="settings-calendar-extra-holidays" />
      </Field>
      <Field id="extraWorkdays" label={t("settingsCompany.extraWorkdays")} hint={t("settingsCompany.datesHint")} error={err("extraWorkdays")}>
        <textarea className="nh-input" id="extraWorkdays" name="extraWorkdays" rows={3} defaultValue={calendar.extraWorkdays.join("\n")} data-testid="settings-calendar-extra-workdays" />
      </Field>
      {state.error && !state.field ? <p className="nh-error" role="alert" data-testid="settings-calendar-error">{t(state.error)}</p> : null}
      {state.ok ? <p className="nh-hint" role="status" data-testid="settings-calendar-saved">{t("settingsCompany.saved")}</p> : null}
      <div>
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-calendar-save">
          {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
        </button>
      </div>
    </form>
  );
}
