"use server";
// /<company>/floor/pair: a shared device enters its pairing code once (FLR-D1, D10, D11). No session is needed;
// the code is the proof. Every attempt counts against `floorPair` before anything is looked up.
import { cookies } from "next/headers";
import {
  DEVICE_COOKIE_SECONDS, FLOOR_DEVICE_COOKIE, hashDeviceToken, looksLikePairCode, newDeviceToken, normalizePairCode, signCookieValue,
} from "@/features/floor/codes";
import type { MessageKey } from "@/i18n";
import { usableSecret } from "@/features/admin/environment";
import { getDb, hasDatabase } from "@/lib/db/client";
import { devicePairByCode, hashFloor, pairDevice } from "@/lib/db/floor";
import { secureCookies } from "@/server/issue-session";
import { clientKey, throttle } from "@/server/throttle";

export type PairState = { ok: true; label: string } | { ok: false; error?: MessageKey; message?: string };

const wrong: PairState = { ok: false, error: "floorDevices.pairWrong" };

export async function pairDeviceAction(slug: string, rawCode: string): Promise<PairState> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  if (!hasDatabase() || !secret || typeof slug !== "string") return { ok: false, error: "floorDevices.pairUnavailable" };

  const blocked = await throttle("floorPair", await clientKey());
  if (blocked) return { ok: false, message: blocked };

  const code = normalizePairCode(typeof rawCode === "string" ? rawCode : "");
  if (!looksLikePairCode(code)) return wrong;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return wrong;

  const now = new Date();
  const device = await devicePairByCode(company.id, hashFloor(company.id, code), now);
  if (!device) return wrong;

  const token = newDeviceToken();
  await pairDevice(company.id, device.id, hashDeviceToken(token), now);
  (await cookies()).set(FLOOR_DEVICE_COOKIE, signCookieValue(token, secret), {
    httpOnly: true,
    sameSite: "lax",
    path: `/${slug}/floor`,
    secure: secureCookies(),
    maxAge: DEVICE_COOKIE_SECONDS,
  });
  return { ok: true, label: device.label };
}
