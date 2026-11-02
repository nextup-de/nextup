"use server";
// /<company>/settings: company profile, rules and calendar (ADM-A1). Every action starts with
// companyAdminOf and writes the company id from the guard, never one from the form. The parsing
// is pure and lives in features/settings/company-forms.ts.
import { revalidatePath } from "next/cache";
import type { Viewer } from "@/features/auth/session";
import { calendarSpec } from "@/features/clock";
import {
  parseCalendarForm, parseCompanyForm, parseRulesForm, type FormFields, type Parsed,
} from "@/features/settings/company-forms";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { saveCalendar } from "@/lib/db/calendar";
import { saveLoopRules } from "@/lib/db/loop";
import { saveCompanyRules } from "@/lib/db/rules";
import { companyAdminOf } from "./guard";

export type SettingsFormState = { ok?: boolean; error?: MessageKey; field?: string };

function fieldsOf(form: FormData): FormFields {
  const out: FormFields = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 || key === "workdays" ? all : (all[0] ?? "");
  }
  return out;
}

/** The guard, then the parse; the caller gets the viewer and the checked values or a state to return. */
type Begun<T> = { state: SettingsFormState } | { state?: undefined; viewer: Viewer; slug: string; value: T };
async function begin<T>(form: FormData, parse: (f: FormFields) => Parsed<T>): Promise<Begun<T>> {
  const fields = fieldsOf(form);
  const slug = typeof fields.slug === "string" ? fields.slug : "";
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { state: { error: "settingsCompany.forbidden" } };
  const parsed = parse(fields);
  if (!parsed.ok) return { state: { error: parsed.error, field: parsed.field } };
  return { viewer, slug, value: parsed.value };
}

function done(slug: string, section: string): SettingsFormState {
  revalidatePath(`${companyPrefix(slug)}/settings/${section}`);
  return { ok: true };
}

export async function saveCompanyAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseCompanyForm);
  if (r.state) return r.state;
  const { companyId, name: by } = r.viewer;
  const { name, mark, profile } = r.value;
  const db = getDb();
  await db.$transaction([
    db.company.update({ where: { id: companyId }, data: { name, mark } }),
    db.companyProfile.upsert({
      where: { companyId },
      create: { companyId, ...profile, updatedBy: by },
      update: { ...profile, updatedBy: by },
    }),
  ]);
  return done(r.slug, "company");
}

export async function saveRulesAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseRulesForm);
  if (r.state) return r.state;
  const { companyId, userId } = r.viewer;
  await saveCompanyRules(companyId, r.value.rules, userId);
  await saveLoopRules(companyId, r.value.loop);
  return done(r.slug, "rules");
}

export async function saveCalendarAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseCalendarForm);
  if (r.state) return r.state;
  await saveCalendar(r.viewer.companyId, calendarSpec(r.value), r.viewer.userId);
  return done(r.slug, "calendar");
}
