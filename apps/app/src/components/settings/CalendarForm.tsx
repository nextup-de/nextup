"use client";
// /settings/calendar: region, working days and the company's own extra holidays and working days,
// with the public holidays and the next days off the page hands in. Adding or removing an extra day
// saves the whole calendar at once.
import { useActionState, useEffect, useRef, useState } from "react";
import { REGIONS, type CalendarSpec } from "@/features/clock";
import type { DayOff } from "@/features/settings/calendar-view";
import { useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE, type MessageKey } from "@/i18n";
import { saveCalendarAction, type SettingsFormState } from "@/server/actions/settings/company";
import { Card, Foot, Row } from "./SettingsParts";
import s from "./settings.module.css";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function useIsoFormat(withYear: boolean) {
  const locale = useLocale();
  const f = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "short", day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
  return (iso: string) => f.format(new Date(`${iso}T00:00:00Z`));
}

/** One list of extra dates: its rows, a Remove per row, and an inline date field to add one. */
function DateList({ title, addLabel, name, dates, onChange, tid }: {
  title: string; addLabel: string; name: string; dates: string[]; onChange: (next: string[]) => void; tid: string;
}) {
  const t = useT();
  const fmt = useIsoFormat(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(draft) && !dates.includes(draft)) onChange([...dates, draft].sort());
    setAdding(false);
    setDraft("");
  };
  return (
    <Card title={title} testId={`settings-calendar-${tid}`}
      action={adding ? null : <button type="button" className={s.soft} onClick={() => setAdding(true)} data-testid={`settings-calendar-${tid}-add`}>{addLabel}</button>}>
      <input type="hidden" name={name} value={dates.join("\n")} data-testid={`settings-calendar-${tid}-value`} />
      <ul className={s.lines}>
        {dates.map((d) => (
          <li key={d} className={s.line}>
            {fmt(d)}
            <button type="button" className={s.lineAction} onClick={() => onChange(dates.filter((x) => x !== d))}>{t("settingsCompany.remove")}</button>
          </li>
        ))}
        {adding ? (
          <li className={s.line}>
            <input className={`${s.input} ${s.dateInput}`} type="date" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={addLabel} />
            <span className={s.inline}>
              <button type="button" className={s.lineAction} onClick={() => setAdding(false)}>{t("settingsCompany.cancel")}</button>
              <button type="button" className={s.soft} onClick={add}>{t("settingsCompany.add")}</button>
            </span>
          </li>
        ) : null}
      </ul>
      {dates.length === 0 && !adding ? <p className={s.empty}>{t("settingsCompany.noneYet")}</p> : null}
    </Card>
  );
}

export function CalendarForm({ slug, calendar, holidays, nextOff, demo }: {
  slug: string; calendar: CalendarSpec; holidays: { year: number; dates: string[] }[]; nextOff: DayOff[]; demo?: boolean;
}) {
  const t = useT();
  const fmt = useIsoFormat(false);
  const fmtYear = useIsoFormat(true);
  // A save started by adding or removing an extra day shows a toast; after a removal it offers Undo.
  const [toast, setToast] = useState<{ removed: { list: "off" | "work"; date: string } | null } | null>(null);
  const auto = useRef(false);
  const lastRemoved = useRef<{ list: "off" | "work"; date: string } | null>(null);
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(async (prev, f) => {
    const wasAuto = auto.current;
    auto.current = false;
    const r = await saveCalendarAction(prev, f);
    setToast(r.ok && wasAuto ? { removed: lastRemoved.current } : null);
    return r;
  }, {});
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  const [year, setYear] = useState(holidays[0]?.year);
  const [extraOff, setExtraOff] = useState(calendar.extraHolidays);
  const [extraWork, setExtraWork] = useState(calendar.extraWorkdays);
  // A change to the extra days is saved right away; the region and weekdays wait for Save.
  const form = useRef<HTMLFormElement>(null);
  const changed = useRef(false);
  useEffect(() => {
    if (changed.current && !demo) {
      auto.current = true;
      form.current?.requestSubmit();
    }
    changed.current = false;
  }, [extraOff, extraWork, demo]);
  const edit = (list: "off" | "work", before: string[], set: (d: string[]) => void, next: string[]) => {
    changed.current = true;
    lastRemoved.current = next.length < before.length ? { list, date: before.find((d) => !next.includes(d)) ?? "" } : null;
    set(next);
  };
  const undo = () => {
    const r = toast?.removed;
    if (!r) return;
    const [list, set] = r.list === "off" ? [extraOff, setExtraOff] : [extraWork, setExtraWork];
    edit(r.list, list, set, [...list, r.date].sort());
  };

  const formError = state.error && !state.field ? t(state.error) : undefined;
  const fieldError = err("extraHolidays") ?? err("extraWorkdays");
  const status = formError ?? fieldError ?? (state.ok ? t("settingsCompany.saved") : demo ? t("settingsCompany.demoData") : undefined);
  const shown = holidays.find((h) => h.year === year) ?? holidays[0];
  const reason: Record<DayOff["reason"], MessageKey> = { weekend: "settingsCompany.offWeekend", holiday: "settingsCompany.offHoliday", extra: "settingsCompany.offExtra" };

  return (
    <form ref={form} action={act} className={s.page} data-testid="settings-calendar-form">
      <input type="hidden" name="slug" value={slug} />
      <Card title={t("settingsCompany.cardWorkdays")}>
        <Row id="region" label={t("settingsCompany.regionLabel")} error={err("region")}>
          <select className={s.input} id="region" name="region" defaultValue={calendar.region} data-testid="settings-calendar-region">
            {REGIONS.map((r) => <option key={r} value={r}>{t(`settingsCompany.region${r}` as MessageKey)}</option>)}
          </select>
        </Row>
        <Row label={t("settingsCompany.workdays")} error={err("workdays")}>
          <div className={s.days} role="group" aria-label={t("settingsCompany.workdays")}>
            {DAYS.map((d) => (
              <label key={d} className={s.day}>
                <input type="checkbox" name="workdays" value={String(d)} defaultChecked={calendar.workdays.includes(d)} data-testid={`settings-calendar-workday-${d}`} />
                <span>{t(`settingsCompany.day${d}` as MessageKey)}</span>
              </label>
            ))}
          </div>
        </Row>
        <Foot status={status} tone={formError || fieldError ? "error" : undefined}
          statusTestId={formError ? "settings-calendar-error" : state.ok ? "settings-calendar-saved" : undefined}>
          <button className={s.save} type="submit" disabled={pending || demo} data-testid="settings-calendar-save">
            {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
          </button>
        </Foot>
      </Card>

      {shown ? (
        <Card title={t("settingsCompany.cardHolidays")} testId={`settings-calendar-holidays-${shown.year}`}
          action={
            <div className={s.seg}>
              {holidays.map((h) => (
                <button key={h.year} type="button" aria-pressed={h.year === shown.year} onClick={() => setYear(h.year)} data-testid={`settings-calendar-year-${h.year}`}>{h.year}</button>
              ))}
            </div>
          }>
          <ul className={s.dateGrid}>
            {shown.dates.map((d) => <li key={d}>{fmt(d)}</li>)}
          </ul>
          <Foot><p className={s.status}>{t("settingsCompany.holidaysFoot")}</p></Foot>
        </Card>
      ) : null}

      <DateList title={t("settingsCompany.cardExtraOff")} addLabel={t("settingsCompany.addDayOff")} name="extraHolidays" dates={extraOff} onChange={(next) => edit("off", extraOff, setExtraOff, next)} tid="extra-holidays" />
      <DateList title={t("settingsCompany.cardExtraWork")} addLabel={t("settingsCompany.addWorkday")} name="extraWorkdays" dates={extraWork} onChange={(next) => edit("work", extraWork, setExtraWork, next)} tid="extra-workdays" />

      {nextOff.length ? (
        <Card title={t("settingsCompany.cardNextOff")}>
          <dl className={s.well}>
            {nextOff.map((o) => (
              <div key={o.date} className={s.wellRow}>
                <dt>{fmt(o.date)}</dt>
                <dd>{t(reason[o.reason])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
      {toast ? (
        <div className={s.toast} role="status" data-testid="settings-calendar-toast">
          <span>{toast.removed ? t("settingsCompany.savedRemoved", { date: fmtYear(toast.removed.date) }) : t("settingsCompany.saved")}</span>
          {toast.removed ? <button type="button" className={s.toastAction} onClick={undo} disabled={pending} data-testid="settings-calendar-undo">{t("settingsCompany.undo")}</button> : null}
        </div>
      ) : null}
    </form>
  );
}
