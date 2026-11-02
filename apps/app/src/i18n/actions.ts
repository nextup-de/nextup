"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getViewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/db/mode";
import { isLocale, LOCALE_COOKIE } from "./index";
import { getT } from "./server";

/** Remember the language: in a cookie, and on the person when signed in with a database. */
export async function setLocale(locale: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getT();
  if (!isLocale(locale)) return { ok: false, error: t("errors.localeInvalid") };
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  if (hasDatabase()) {
    try {
      const viewer = await getViewer();
      if (viewer) await getDb().user.updateMany({ where: { id: viewer.userId, companyId: viewer.companyId }, data: { locale } });
    } catch {
      return { ok: false, error: t("errors.localeNotSaved") };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
