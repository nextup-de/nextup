"use server";
// /<company>/settings/areas/devices: shared shop-floor devices and floor codes (FLR-D1). Every action starts
// with companyAdminOf and names the company from the guard. The pairing code and the floor code are returned
// once, for the page to show; the database only holds a hash, and the audit row only "set" or "replaced" (D9, D10).
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { PAIR_CODE_MINUTES, newFloorCode, newPairCode } from "@/features/floor/codes";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { hashFloor } from "@/lib/db/floor";
import { settingsActor } from "@/server/audit/record";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type DeviceResult =
  | { ok: true; deviceId: string; label: string; pairCode: string; until: string }
  | { ok: false; error: MessageKey };
export type DeviceActionResult = { ok: true } | { ok: false; error: MessageKey };
export type PairCodeResult = { ok: true; pairCode: string; until: string } | { ok: false; error: MessageKey };
export type FloorCodeResult = { ok: true; code: string } | { ok: false; error: MessageKey };

const FORBIDDEN: MessageKey = "settingsCompany.forbidden";
const AUDIT_FAILED: MessageKey = "settingsCompany.auditFailed";
const clash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

class Refused extends Error {
  constructor(readonly key: MessageKey) {
    super(key);
  }
}

const refresh = (slug: string) => revalidatePath(`${companyPrefix(slug)}/settings/areas/devices`);
const pairUntil = () => new Date(Date.now() + PAIR_CODE_MINUTES * 60_000);

/**
 * Draws a code until its hash is free (it is unique), one transaction per draw. `run` throws Refused to say no.
 * Returns the key to show, or the code that now stands.
 */
async function withFreshCode<T>(
  companyId: string,
  make: () => string,
  run: (code: string, hash: string) => Promise<{ ok: true; value: T } | { ok: false }>,
): Promise<{ ok: true; code: string; value: T } | { ok: false; error: MessageKey }> {
  for (let i = 0; i < 8; i++) {
    const code = make();
    try {
      const r = await run(code, hashFloor(companyId, code));
      return r.ok ? { ok: true, code, value: r.value } : { ok: false, error: AUDIT_FAILED };
    } catch (e) {
      if (e instanceof Refused) return { ok: false, error: e.key };
      if (!clash(e)) throw e;
    }
  }
  return { ok: false, error: "floorDevices.errCode" };
}

export async function createDeviceAction(slug: string, input: { label: string; areaIds: string[] }): Promise<DeviceResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: FORBIDDEN };
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length < 1 || label.length > 60) return { ok: false, error: "floorDevices.errLabel" };
  const areaIds = [...new Set(Array.isArray(input.areaIds) ? input.areaIds.filter((a): a is string => typeof a === "string") : [])];
  const { companyId } = viewer;

  const until = pairUntil();
  const r = await withFreshCode<string>(companyId, newPairCode, (code, hash) =>
    audited<string>(
      companyId,
      (id) => ({
        actor: settingsActor(viewer), action: "audit.settings.areas", target: { kind: "device", id }, source: "settings",
        changes: auditChanges(null, { label, areaIds, pairCode: code }, ["pairCode"]),
      }),
      async (tx: Tx) => {
        if (areaIds.length > 0 && (await tx.floorArea.count({ where: { companyId, id: { in: areaIds } } })) !== areaIds.length) {
          throw new Refused("floorDevices.errAreas");
        }
        const row = await tx.floorDevice.create({
          data: { companyId, label, areaIds, pairCodeHash: hash, pairCodeUntil: until, createdBy: viewer.userId },
          select: { id: true },
        });
        return row.id;
      },
    ),
  );
  if (!r.ok) return r;
  refresh(slug);
  return { ok: true, deviceId: r.value, label, pairCode: r.code, until: until.toISOString() };
}

export async function newPairCodeAction(slug: string, deviceId: string): Promise<PairCodeResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: FORBIDDEN };
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, error: "floorDevices.errDevice" };
  const { companyId } = viewer;

  const until = pairUntil();
  const r = await withFreshCode<true>(companyId, newPairCode, (code, hash) =>
    audited<true>(
      companyId,
      () => ({
        actor: settingsActor(viewer), action: "audit.settings.areas", target: { kind: "device", id: deviceId }, source: "settings",
        changes: auditChanges({ pairCode: null }, { pairCode: code }, ["pairCode"]),
      }),
      async (tx: Tx) => {
        const n = await tx.floorDevice.updateMany({ where: { id: deviceId, companyId }, data: { pairCodeHash: hash, pairCodeUntil: until } });
        if (n.count !== 1) throw new Refused("floorDevices.errDevice");
        return true;
      },
    ),
  );
  if (!r.ok) return r;
  refresh(slug);
  return { ok: true, pairCode: r.code, until: until.toISOString() };
}

export async function removeDeviceAction(slug: string, deviceId: string): Promise<DeviceActionResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: FORBIDDEN };
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, error: "floorDevices.errDevice" };
  const { companyId } = viewer;
  try {
    const r = await audited<string>(
      companyId,
      (label) => ({
        actor: settingsActor(viewer), action: "audit.settings.areas", target: { kind: "device", id: deviceId }, source: "settings",
        changes: auditChanges({ label }, null),
      }),
      async (tx: Tx) => {
        const row = await tx.floorDevice.findFirst({ where: { id: deviceId, companyId }, select: { label: true } });
        if (!row) throw new Refused("floorDevices.errDevice");
        await tx.floorDevice.deleteMany({ where: { id: deviceId, companyId } });
        return row.label;
      },
    );
    if (!r.ok) return { ok: false, error: AUDIT_FAILED };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.key };
    throw e;
  }
  refresh(slug);
  return { ok: true };
}

export async function issueFloorCodeAction(slug: string, userId: string): Promise<FloorCodeResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: FORBIDDEN };
  if (typeof userId !== "string" || !userId) return { ok: false, error: "floorDevices.errMember" };
  const { companyId } = viewer;

  // Six digits are a small space: when another person of this company holds the same code, draw again.
  const r = await withFreshCode<boolean>(companyId, newFloorCode, (code, hash) =>
    audited<boolean>(
      companyId,
      (replaced) => ({
        actor: settingsActor(viewer), action: "audit.settings.areas", target: { kind: "member", id: userId }, source: "settings",
        changes: auditChanges({ floorCode: replaced ? "old" : null }, { floorCode: code }, ["floorCode"]),
      }),
      async (tx: Tx) => {
        const person = await tx.user.findFirst({ where: { id: userId, companyId, active: true }, select: { id: true } });
        if (!person) throw new Refused("floorDevices.errMember");
        const had = await tx.floorCode.findFirst({ where: { userId, companyId }, select: { userId: true } });
        await tx.floorCode.upsert({
          where: { userId, companyId },
          create: { userId, companyId, codeHash: hash, createdBy: viewer.userId },
          update: { codeHash: hash, createdBy: viewer.userId, createdAt: new Date() },
        });
        return had !== null;
      },
    ),
  );
  if (!r.ok) return r;
  refresh(slug);
  return { ok: true, code: r.code };
}
