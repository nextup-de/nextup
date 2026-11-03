// Shop-floor access (docs/adr/0007-areas.md, plan FLR): areas with a QR code, shared devices, floor codes
// and the references reporters keep. Every query goes through the tenant-scoped client and names its company.
// Secrets (device token, pairing code, floor code, reference) are stored as hashes only; hashFloor builds them.
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db/client";

/** sha256 hex of `companyId:secret`, so the same code in two companies hashes differently. */
export function hashFloor(companyId: string, secret: string): string {
  return createHash("sha256").update(`${companyId}:${secret}`).digest("hex");
}

export type AreaInput = {
  id?: string;
  key: string;
  name: string;
  unitId: string;
  roleId: string;
  anonymous?: boolean;
  on?: boolean;
};

const AREA_WITH_NAMES = { unit: { select: { name: true } }, role: { select: { title: true } } } as const;
export type AreaRow = Prisma.FloorAreaGetPayload<{ include: typeof AREA_WITH_NAMES }>;
export type DeviceRow = Prisma.FloorDeviceGetPayload<object>;

const isUniqueClash = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ── Areas ────────────────────────────────────────────────────────────────────────────────────────

export async function listAreas(companyId: string): Promise<AreaRow[]> {
  return getDb().floorArea.findMany({ where: { companyId }, include: AREA_WITH_NAMES, orderBy: [{ name: "asc" }, { key: "asc" }] });
}

export async function findArea(companyId: string, key: string): Promise<AreaRow | null> {
  return getDb().floorArea.findFirst({ where: { companyId, key }, include: AREA_WITH_NAMES });
}

/** Create, or update when `input.id` is set. Throws when the unit or role is not this company's, or the key is taken. */
export async function saveArea(companyId: string, input: AreaInput, by: string | null): Promise<AreaRow> {
  const db = getDb();
  const [unit, role] = await Promise.all([
    db.orgUnit.findFirst({ where: { id: input.unitId, companyId }, select: { id: true } }),
    db.orgRole.findFirst({ where: { id: input.roleId, companyId }, select: { id: true } }),
  ]);
  if (!unit || !role) throw new Error("The unit or role is not part of this company.");
  const fields = {
    key: input.key,
    name: input.name,
    unitId: input.unitId,
    roleId: input.roleId,
    ...(input.anonymous !== undefined ? { anonymous: input.anonymous } : {}),
    ...(input.on !== undefined ? { on: input.on } : {}),
    updatedBy: by,
  };
  if (input.id) {
    return db.floorArea.update({ where: { id: input.id, companyId }, data: fields, include: AREA_WITH_NAMES });
  }
  return db.floorArea.create({ data: { ...fields, companyId }, include: AREA_WITH_NAMES });
}

export async function removeArea(companyId: string, id: string): Promise<void> {
  await getDb().floorArea.deleteMany({ where: { id, companyId } });
}

// ── Devices ──────────────────────────────────────────────────────────────────────────────────────

export async function listDevices(companyId: string): Promise<DeviceRow[]> {
  return getDb().floorDevice.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function createDevice(
  companyId: string,
  input: { label: string; areaIds: string[] },
  by: string | null,
): Promise<DeviceRow> {
  return getDb().floorDevice.create({ data: { companyId, label: input.label, areaIds: input.areaIds, createdBy: by } });
}

export async function setPairCode(companyId: string, deviceId: string, codeHash: string, until: Date): Promise<void> {
  await getDb().floorDevice.updateMany({ where: { id: deviceId, companyId }, data: { pairCodeHash: codeHash, pairCodeUntil: until } });
}

/** The device a pairing code is waiting for - only while the code has not expired. */
export async function devicePairByCode(companyId: string, codeHash: string, now: Date): Promise<DeviceRow | null> {
  return getDb().floorDevice.findFirst({ where: { companyId, pairCodeHash: codeHash, pairCodeUntil: { gt: now } } });
}

/** Binds the device token and clears the pairing code, so a code works once. */
export async function pairDevice(companyId: string, deviceId: string, tokenHash: string, now: Date): Promise<void> {
  await getDb().floorDevice.updateMany({
    where: { id: deviceId, companyId },
    data: { tokenHash, pairedAt: now, pairCodeHash: null, pairCodeUntil: null },
  });
}

export async function deviceByToken(companyId: string, tokenHash: string): Promise<DeviceRow | null> {
  return getDb().floorDevice.findFirst({ where: { companyId, tokenHash } });
}

export async function touchDevice(companyId: string, id: string, now: Date): Promise<void> {
  await getDb().floorDevice.updateMany({ where: { id, companyId }, data: { lastUsedAt: now } });
}

export async function removeDevice(companyId: string, id: string): Promise<void> {
  await getDb().floorDevice.deleteMany({ where: { id, companyId } });
}

// ── Floor codes ──────────────────────────────────────────────────────────────────────────────────

/** Sets or replaces a person's floor code. Throws when another person in this company already has the same code. */
export async function setFloorCode(companyId: string, userId: string, codeHash: string, by: string | null): Promise<void> {
  const db = getDb();
  const user = await db.user.findFirst({ where: { id: userId, companyId }, select: { id: true } });
  if (!user) throw new Error("The person is not part of this company.");
  await db.floorCode.upsert({
    where: { userId, companyId },
    create: { userId, companyId, codeHash, createdBy: by },
    update: { codeHash, createdBy: by, createdAt: new Date() },
  });
}

/** The active person behind a floor code, or null. */
export async function floorUserByCode(companyId: string, codeHash: string): Promise<{ id: string; name: string; role: string } | null> {
  const db = getDb();
  const code = await db.floorCode.findFirst({ where: { companyId, codeHash } });
  if (!code) return null;
  return db.user.findFirst({ where: { id: code.userId, companyId, active: true }, select: { id: true, name: true, role: true } });
}

// ── References ───────────────────────────────────────────────────────────────────────────────────

/** False when this company already has the hash (the caller draws a new reference). */
export async function saveReference(
  companyId: string,
  input: { hash: string; caseId: string; areaId: string | null },
): Promise<boolean> {
  try {
    await getDb().floorReference.create({ data: { companyId, hash: input.hash, caseId: input.caseId, areaId: input.areaId } });
    return true;
  } catch (e) {
    if (isUniqueClash(e)) return false;
    throw e;
  }
}

export async function referenceByHash(companyId: string, hash: string): Promise<{ caseId: string; areaId: string | null; createdAt: Date } | null> {
  return getDb().floorReference.findFirst({ where: { companyId, hash }, select: { caseId: true, areaId: true, createdAt: true } });
}
