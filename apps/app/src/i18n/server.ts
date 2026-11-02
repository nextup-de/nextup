// Server only: the locale of a request and of a mail recipient. Reads lib/db and auth, edits neither.
import { cookies } from "next/headers";
import { getViewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/db/mode";
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, resolveLocale, resolveRecipientLocale, type Locale, type T } from "./index";

export async function companyLocale(companyId: string): Promise<Locale> {
  if (!hasDatabase()) return DEFAULT_LOCALE;
  try {
    const cfg = await getDb().companyConfig.findUnique({ where: { companyId }, select: { defaultLocale: true } });
    return resolveLocale({ companyLocale: cfg?.defaultLocale });
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function recipient(companyId: string, where: { id: string } | { email: { equals: string; mode: "insensitive" } }): Promise<Locale> {
  if (!hasDatabase()) return DEFAULT_LOCALE;
  try {
    const db = getDb();
    const [user, cfg] = await Promise.all([
      db.user.findFirst({ where: { companyId, ...where }, select: { locale: true } }),
      db.companyConfig.findUnique({ where: { companyId }, select: { defaultLocale: true } }),
    ]);
    return resolveRecipientLocale({ userLocale: user?.locale, companyLocale: cfg?.defaultLocale });
  } catch {
    return DEFAULT_LOCALE;
  }
}

export const localeForUser = (companyId: string, userId: string): Promise<Locale> => recipient(companyId, { id: userId });

export const localeForEmail = (companyId: string, email: string): Promise<Locale> =>
  recipient(companyId, { email: { equals: email.trim(), mode: "insensitive" } });

export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  if (!hasDatabase()) return DEFAULT_LOCALE;
  try {
    const viewer = await getViewer();
    if (!viewer) return DEFAULT_LOCALE;
    return await recipient(viewer.companyId, { id: viewer.userId });
  } catch {
    return resolveLocale({ cookie });
  }
}

export async function getT(): Promise<T> {
  return createT(await getLocale());
}
