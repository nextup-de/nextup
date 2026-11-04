"use server";
// The shop-floor actions (plan FLR): raise from an area, sign in with a floor code, sign out.
// No NextUp session is involved; the floor cookies open nothing outside /<slug>/floor (D8, D9).
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FLOOR_SENT_COOKIE, FLOOR_USER_COOKIE, signFloorCookie } from "@/features/floor/cookies";
import { companyPrefix, servedOverHttps } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { floorUserByCode, hashFloor } from "@/lib/db/floor";
import { hasDatabase } from "@/lib/db/mode";
import { floorAddressLimit, floorDeviceOf, floorPath, floorSecret, floorUserFromCookie, raiseFromFloor, type FloorRaiseResult } from "@/server/floor/raise";
import { throttle } from "@/server/throttle";

const SENT_TTL_SECONDS = 120;
const USER_TTL_SECONDS = 120;

export type FloorRaiseFailure = Extract<FloorRaiseResult, { ok: false }>;
export type FloorSignInResult =
  | { ok: true; name: string }
  | { ok: false; reason: "wrong" | "limited" | "unavailable"; message?: string };

async function companyIdOf(slug: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  return (await getDb().company.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
}

const cookieOptions = (slug: string, maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: servedOverHttps(),
  path: floorPath(slug),
  maxAge,
});

/** Sends a report. Returns only a failure; a success redirects to the sent page. */
export async function floorRaiseAction(
  slug: string,
  input: { area: string; kind: string; title: string; body: string; nonce: string },
): Promise<FloorRaiseFailure> {
  const secret = floorSecret();
  const companyId = await companyIdOf(slug);
  if (!secret || !companyId) return { ok: false, reason: "unknown" };

  const jar = await cookies();
  const signedIn = await floorUserFromCookie(companyId);
  const device = await floorDeviceOf(slug, companyId, true);
  const result = await raiseFromFloor(slug, input, signedIn ? { userId: signedIn.id } : "anonymous", device);
  if (!result.ok) return result;

  if (result.reference !== null) {
    const exp = Math.floor(Date.now() / 1000) + SENT_TTL_SECONDS;
    const claims = { ref: result.reference, role: result.roleTitle, named: signedIn !== null, exp };
    jar.set(FLOOR_SENT_COOKIE, signFloorCookie(claims, secret), cookieOptions(slug, SENT_TTL_SECONDS));
  }
  jar.delete({ name: FLOOR_USER_COOKIE, path: floorPath(slug) });
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  redirect(`${companyPrefix(slug)}/floor/sent`);
}

/** A six-digit floor code opens a two-minute floor sign-in for the person it was issued to. */
export async function floorSignInAction(slug: string, code: string): Promise<FloorSignInResult> {
  const secret = floorSecret();
  const companyId = await companyIdOf(slug);
  if (!secret || !companyId) return { ok: false, reason: "unavailable" };

  const device = await floorDeviceOf(slug, companyId, true);
  const limited = (await throttle("floorCode", device.key)) ?? (await floorAddressLimit("floorCodeAddress", device.key));
  if (limited) return { ok: false, reason: "limited", message: limited };

  // A wrong code and a deactivated member look the same (D9).
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "wrong" };
  const user = await floorUserByCode(companyId, hashFloor(companyId, code));
  if (!user) return { ok: false, reason: "wrong" };

  const exp = Math.floor(Date.now() / 1000) + USER_TTL_SECONDS;
  const value = signFloorCookie({ cid: companyId, uid: user.id, exp }, secret);
  (await cookies()).set(FLOOR_USER_COOKIE, value, cookieOptions(slug, USER_TTL_SECONDS));
  return { ok: true, name: user.name };
}

export async function floorSignOutAction(slug: string): Promise<void> {
  (await cookies()).delete({ name: FLOOR_USER_COOKIE, path: floorPath(slug) });
  revalidatePath("/" + slug, "layout");
}
