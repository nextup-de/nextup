// A raise from a shop-floor area (plan FLR, D7): the case lands on a seat of the area's role, signed in
// as the floor user or as system:floor, and the reporter gets a reference. Not a "use server" module:
// the floor actions call it (server/actions/floor.ts).
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { usableSecret } from "@/features/admin/environment";
import { FLOOR_ANON_COOKIE, FLOOR_DEVICE_COOKIE, FLOOR_USER_COOKIE, verifyFloorCookie } from "@/features/floor/cookies";
import { companyPrefix, servedOverHttps } from "@/features/tenant/urls";
import { actorLabel } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import { checkRaise, floorRaisePayload, newReference, pickSeat, type RaiseInput } from "@/features/floor/raise";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { deviceByToken, findArea, hashFloor, saveReference, touchDevice } from "@/lib/db/floor";
import { hasDatabase } from "@/lib/db/mode";
import { clientKey, throttle } from "@/server/throttle";

export type FloorDevice = { key: string; deviceId: string | null };
export type FloorRaiseInput = RaiseInput & { area: string; nonce: string };
export type FloorRaiseResult =
  | { ok: true; reference: string | null; duplicate: boolean; roleTitle: string }
  | { ok: false; reason: "vacant" | "paused" | "unknown" | "anonymousOff" | "limited" | "invalid"; message?: string };

const REFERENCE_TRIES = 8;

export async function raiseFromFloor(
  slug: string,
  input: FloorRaiseInput,
  who: { userId: string } | "anonymous",
  device: FloorDevice,
): Promise<FloorRaiseResult> {
  if (!hasDatabase()) return { ok: false, reason: "unknown" };
  const checked = checkRaise(input);
  if (!checked.ok || !/^[A-Za-z0-9_-]{8,64}$/.test(input.nonce)) return { ok: false, reason: "invalid" };

  const db = getDb();
  const company = await db.company.findUnique({ where: { slug }, select: { id: true, openedAt: true } });
  if (!company) return { ok: false, reason: "unknown" };
  if (!company.openedAt) return { ok: false, reason: "paused" }; // closed until opened: no cases from the floor yet
  const companyId = company.id;

  const area = await findArea(companyId, input.area);
  if (!area) return { ok: false, reason: "unknown" };
  if (!area.on) return { ok: false, reason: "paused" };
  if (who === "anonymous" && !area.anonymous) return { ok: false, reason: "anonymousOff" };

  let actor = "system:floor";
  let actorUserId: string | null = null;
  if (who !== "anonymous") {
    const user = await db.user.findFirst({
      where: { id: who.userId, companyId, active: true },
      select: { id: true, name: true, handle: true, role: true },
    });
    if (!user) return { ok: false, reason: "unknown" };
    actor = actorLabel({ role: user.role as Role, name: user.name, handle: user.handle });
    actorUserId = user.id;
  }

  const holders = await db.orgRoleHolder.findMany({
    where: { companyId, roleId: area.roleId },
    orderBy: { sort: "asc" },
    select: { id: true, name: true, userId: true, sort: true },
  });
  const userIds = holders.flatMap((h) => (h.userId === null ? [] : [h.userId]));
  const active = userIds.length
    ? await db.user.findMany({ where: { companyId, id: { in: userIds }, active: true }, select: { id: true } })
    : [];
  const seat = pickSeat(
    holders.map((h) => ({ id: h.id, label: h.name, userId: h.userId, sort: h.sort })),
    active.map((u) => u.id),
  );
  if (!seat) return { ok: false, reason: "vacant" };

  const limited =
    (await throttle("floorRaise", `${device.key}|${area.id}`)) ??
    (await floorAddressLimit("floorRaiseAddress", device.key, area.id)) ??
    (await throttle("floorRaiseAll", area.id));
  if (limited) return { ok: false, reason: "limited", message: limited };

  const caseId = `c_${randomUUID()}`;
  const result = await appendEventRow(
    companyId,
    {
      id: `e_${randomUUID()}`,
      day: 0,
      type: "case.raised",
      actor,
      targetId: caseId,
      payload: floorRaisePayload({ ...checked.value, seat, unitName: area.unit.name }),
    },
    { actorUserId, source: "floor", idemKey: `floor:${input.nonce}` },
  );
  if (!result.ok) return { ok: false, reason: "unknown" };
  if (result.duplicate) return { ok: true, reference: null, duplicate: true, roleTitle: area.role.title };

  let reference: string | null = null;
  for (let i = 0; i < REFERENCE_TRIES && reference === null; i++) {
    const candidate = newReference();
    if (await saveReference(companyId, { hash: hashFloor(companyId, candidate), caseId, areaId: area.id })) reference = candidate;
  }
  if (reference === null) return { ok: false, reason: "unknown" };

  if (device.deviceId) await touchDevice(companyId, device.deviceId, new Date());
  return { ok: true, reference, duplicate: false, roleTitle: area.role.title };
}

// ── The floor cookies, read on the server ────────────────────────────────────────────────────────

/** The signed AUTH_SECRET, or null when the box has none worth signing with. */
export function floorSecret(): string | null {
  return usableSecret(process.env.AUTH_SECRET);
}

/** The path the floor cookies are scoped to: /<slug>/floor, or /floor when the company is the host. */
export function floorPath(slug: string): string {
  return `${companyPrefix(slug)}/floor`;
}

/** The person who signed in with a floor code in the last two minutes, or null. Never a NextUp session. */
export async function floorUserFromCookie(companyId: string): Promise<{ id: string; name: string } | null> {
  const secret = floorSecret();
  if (!secret) return null;
  const claims = verifyFloorCookie((await cookies()).get(FLOOR_USER_COOKIE)?.value, secret);
  if (!claims || claims.cid !== companyId || typeof claims.uid !== "string") return null;
  return getDb().user.findFirst({ where: { id: claims.uid, companyId, active: true }, select: { id: true, name: true } });
}

/**
 * The second limit for an anonymous browser (FX6): it can drop its cookie and be new again, so it also counts
 * by address. A paired device does not: its token cannot be made up, and a shared tablet is many people.
 */
export async function floorAddressLimit(bucket: "floorCodeAddress" | "floorStatusAddress" | "floorRaiseAddress", deviceKey: string, scope?: string): Promise<string | null> {
  if (!deviceKey.startsWith("a:")) return null;
  const address = await clientKey();
  return throttle(bucket, scope ? `${address}|${scope}` : address);
}

/**
 * The rate-limit key of this browser: `d:<device id>` when it is a paired shared device, else
 * `a:<anon id>`; the anon cookie is set when missing (D10). Only a server action may set cookies.
 */
export async function floorDeviceOf(slug: string, companyId: string, mayWrite: boolean): Promise<FloorDevice> {
  const jar = await cookies();
  const secret = floorSecret();
  const device = secret ? verifyFloorCookie(jar.get(FLOOR_DEVICE_COOKIE)?.value, secret) : null;
  if (device && typeof device.t === "string") {
    const row = await deviceByToken(companyId, hashFloor(companyId, device.t));
    if (row) return { key: `d:${row.id}`, deviceId: row.id };
  }
  let anon = jar.get(FLOOR_ANON_COOKIE)?.value;
  if (!anon || !/^[A-Za-z0-9_-]{16,64}$/.test(anon)) {
    anon = randomBytes(18).toString("base64url");
    if (mayWrite) jar.set(FLOOR_ANON_COOKIE, anon, { httpOnly: true, sameSite: "lax", secure: servedOverHttps(), path: floorPath(slug), maxAge: 400 * 86400 });
  }
  return { key: `a:${anon}`, deviceId: null };
}
