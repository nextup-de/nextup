"use server";
// /<company>/settings: company profile, rules and calendar (ADM-A1). Every action starts with
// companyAdminOf and writes the company id from the guard, never one from the form. The parsing
// is pure and lives in features/settings/company-forms.ts.
import { revalidatePath } from "next/cache";
import type { Viewer } from "@/features/auth/session";
import { auditChanges } from "@/features/audit";
import { calendarSpec } from "@/features/clock";
import {
  parseCalendarForm, parseCompanyForm, parseRulesForm, type FormFields, type Parsed,
} from "@/features/settings/company-forms";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { invalidateFlags } from "@/features/flags";
import { loadCalendar, saveCalendar } from "@/lib/db/calendar";
import { loadLoopRules, saveLoopRules } from "@/lib/db/loop";
import { loadCompanyRules, saveCompanyRules } from "@/lib/db/rules";
import { settingsActor } from "@/server/audit/record";
import { audited } from "./audited";
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

// The profile's free texts are written as set/replaced/removed only: they are prose that may name people (D9).
const PROFILE_TEXTS = ["vision", "mission", "principles", "businessModel", "complianceRules"] as const;

export async function saveCompanyAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseCompanyForm);
  if (r.state) return r.state;
  const { companyId, name: by } = r.viewer;
  const { name, mark, profile } = r.value;
  const saved = await audited(
    companyId,
    (changes: ReturnType<typeof auditChanges>) => ({
      actor: settingsActor(r.viewer), action: "audit.company.saved", target: { kind: "company", id: companyId }, changes, source: "settings",
    }),
    async (tx) => {
      const [co, prof] = await Promise.all([
        tx.company.findUnique({ where: { id: companyId }, select: { name: true, mark: true } }),
        tx.companyProfile.findUnique({ where: { companyId } }),
      ]);
      await tx.company.update({ where: { id: companyId }, data: { name, mark } });
      await tx.companyProfile.upsert({
        where: { companyId },
        create: { companyId, ...profile, updatedBy: by },
        update: { ...profile, updatedBy: by },
      });
      const was: Record<string, unknown> = { name: co?.name, mark: co?.mark };
      for (const k of PROFILE_TEXTS) was[k] = prof?.[k];
      return auditChanges(was, { name, mark, ...profile }, PROFILE_TEXTS);
    },
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  return done(r.slug, "company");
}

export async function saveRulesAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseRulesForm);
  if (r.state) return r.state;
  const { companyId, userId } = r.viewer;
  const before = { ...(await loadCompanyRules(companyId)), ...(await loadLoopRules(companyId)) } as Record<string, unknown>;
  const saved = await audited(
    companyId,
    () => ({
      actor: settingsActor(r.viewer), action: "audit.settings.rules", target: { kind: "company", id: companyId },
      changes: auditChanges(before, { ...r.value.rules, ...r.value.loop } as Record<string, unknown>), source: "settings",
    }),
    async (tx) => {
      await saveCompanyRules(companyId, r.value.rules, userId, tx);
      await saveLoopRules(companyId, r.value.loop, tx);
    },
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  invalidateFlags(r.slug);
  return done(r.slug, "rules");
}

export async function saveCalendarAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const r = await begin(form, parseCalendarForm);
  if (r.state) return r.state;
  const { companyId } = r.viewer;
  const before = await loadCalendar(companyId);
  const after = calendarSpec(r.value);
  const saved = await audited(
    companyId,
    () => ({
      actor: settingsActor(r.viewer), action: "audit.settings.calendar", target: { kind: "company", id: companyId },
      changes: auditChanges(before, after), source: "settings",
    }),
    (tx) => saveCalendar(companyId, after, r.viewer.userId, tx),
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  return done(r.slug, "calendar");
}
