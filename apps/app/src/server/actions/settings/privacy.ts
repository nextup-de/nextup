"use server";
// /<company>/settings/privacy: the page's data and its writes (GDP-S1, D16, D17, D18). Every action starts with
// companyAdminOf and writes the guard's company id, never one from the caller. Each save and its audit row
// commit together.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { getViewerFor } from "@/features/auth/session";
import { formErrors, type FormErrorKey, type RuleInput } from "@/features/privacy/privacy-form";
import { retentionHealth } from "@/features/privacy/retention-health";
import { RETENTION_KINDS, checkRule, effectiveRules, isRetentionKind, type RetentionKind } from "@/features/privacy/retention";
import { companyPrefix } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { loadPrivacyPolicy } from "@/lib/db/privacy-settings";
import { countRemovable, loadRetention, type RetentionTotals } from "@/lib/db/retention";
import { settingsActor } from "@/server/audit/record";
import { listExportsAction, type ExportListItem } from "@/server/actions/privacy-export";
import { audited } from "./audited";
import { companyAdminOf } from "./guard";

export type PrivacyPageData = {
  rules: RuleInput;
  /** Date and company totals of the last retention run; null before the first run. */
  lastRun: { at: string | null; removed: Partial<RetentionTotals> } | null;
  /** The last run failed (plan REM, Q10.15): when and why, and whether it has failed two nights in a row; null when it did not. */
  lastFailure: { at: string | null; error: string; warn: boolean } | null;
  dpaSignedAt: string | null;
  reportScreenshots: boolean;
  exports: ExportListItem[];
  /** Display names for the requester of each export, whoever marked one as delivered, and the admin, by user id. */
  names: Record<string, string>;
};

export type SaveResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "auditFailed"; fields?: Partial<Record<RetentionKind, FormErrorKey>> };

/** The page's data for a company admin, else null. */
export async function loadPrivacyPage(slug: string): Promise<PrivacyPageData | null> {
  const admin = await companyAdminOf(slug);
  if (!admin) return null;
  const { companyId } = admin;
  const [retention, config, policy, exports] = await Promise.all([
    loadRetention(companyId),
    getDb().companyConfig.findUnique({ where: { companyId }, select: { dpaSignedAt: true } }),
    loadPrivacyPolicy(companyId),
    listExportsAction(slug),
  ]);
  const list = exports ?? [];
  const ids = [...new Set([admin.userId, ...list.flatMap((e) => [e.requestedByUserId, e.delivered?.byUserId ?? admin.userId])])];
  const users = ids.length ? await getDb().user.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  return {
    rules: retention.rules,
    lastRun: retention.lastRun
      ? { at: (retention.lastRun.lastOkAt ?? retention.lastRun.lastRunAt)?.toISOString() ?? null, removed: retention.lastRun.removed }
      : null,
    lastFailure: retention.lastRun?.lastError
      ? { at: retention.lastRun.lastRunAt?.toISOString() ?? null, error: retention.lastRun.lastError, warn: retentionHealth([retention.lastRun]).status === "warn" }
      : null,
    dpaSignedAt: config?.dpaSignedAt ? config.dpaSignedAt.toISOString() : null,
    reportScreenshots: policy.reportScreenshots,
    exports: list,
    names: Object.fromEntries(users.map((u) => [u.id, u.name])),
  };
}

/** The company total a rule of `keepDays` would remove now, for the confirm dialog. Null for a non-admin or a refused value. */
export async function previewRetention(slug: string, kind: RetentionKind, keepDays: number | null): Promise<number | null> {
  const admin = await companyAdminOf(slug);
  if (!admin || !isRetentionKind(kind)) return null;
  if (!checkRule(kind, keepDays).ok) return null;
  return countRemovable(admin.companyId, kind, keepDays);
}

export async function saveRetentionAction(slug: string, input: RuleInput): Promise<SaveResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "forbidden" };
  const next = {} as RuleInput;
  for (const k of RETENTION_KINDS) next[k] = typeof input?.[k] === "number" ? input[k] : null;
  const fields = formErrors(next);
  if (Object.keys(fields).length) return { ok: false, error: "invalid", fields };

  const { companyId } = admin;
  const saved = await audited(
    companyId,
    (changed: { before: RuleInput; after: RuleInput } | null) =>
      changed
        ? {
            actor: settingsActor(admin), action: "audit.privacy.retention", target: { kind: "company", id: companyId },
            changes: auditChanges(changed.before, changed.after), source: "settings",
          }
        : null,
    async (tx) => {
      const rows = await tx.retentionRule.findMany({ where: { companyId }, select: { kind: true, keepDays: true } });
      const cfg = await tx.companyConfig.findUnique({ where: { companyId }, select: { retentionDays: true } });
      const before = effectiveRules(rows, cfg);
      const changedKinds = RETENTION_KINDS.filter((k) => before[k] !== next[k]);
      if (!changedKinds.length) return null;
      for (const kind of changedKinds) {
        await tx.retentionRule.upsert({
          where: { companyId_kind: { companyId, kind } },
          create: { companyId, kind, keepDays: next[kind], updatedById: admin.userId },
          update: { keepDays: next[kind], updatedById: admin.userId },
        });
      }
      const pick = (r: RuleInput) => Object.fromEntries(changedKinds.map((k) => [k, r[k]]));
      return { before: pick(before) as RuleInput, after: pick(next) as RuleInput };
    },
  );
  if (!saved.ok) return { ok: false, error: "auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/privacy`);
  return { ok: true };
}

export async function saveScreenshotsAction(slug: string, on: boolean): Promise<SaveResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "forbidden" };
  const { companyId } = admin;
  const value = on === true;
  const saved = await audited(
    companyId,
    (before: boolean | null) =>
      before === value
        ? null
        : {
            actor: settingsActor(admin), action: "audit.privacy.screenshots", target: { kind: "company", id: companyId },
            changes: auditChanges({ reportScreenshots: before }, { reportScreenshots: value }), source: "settings",
          },
    async (tx) => {
      const row = await tx.privacyPolicy.findUnique({ where: { companyId }, select: { reportScreenshots: true } });
      const before = row?.reportScreenshots ?? true;
      await tx.privacyPolicy.upsert({
        where: { companyId },
        create: { companyId, reportScreenshots: value, updatedById: admin.userId },
        update: { reportScreenshots: value, updatedById: admin.userId },
      });
      return before;
    },
  );
  if (!saved.ok) return { ok: false, error: "auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/privacy`);
  return { ok: true };
}

/** For the report dialog: any signed-in person of the company may ask. Not signed in: false. */
export async function reportScreenshotsAllowed(slug: string): Promise<boolean> {
  const viewer = await getViewerFor(slug);
  if (!viewer) return false;
  return (await loadPrivacyPolicy(viewer.companyId)).reportScreenshots;
}
