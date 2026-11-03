"use server";
// The status page's actions (plan FLR, D8, D12). The reference travels in the POST body only, never in a URL.
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/db/mode";
import { floorDeviceOf } from "@/server/floor/raise";
import { floorReply, floorStatus, type FloorReplyResult, type FloorStatusResult } from "@/server/floor/status";

async function deviceKeyOf(slug: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  return company ? (await floorDeviceOf(slug, company.id, true)).key : null;
}

export async function floorStatusAction(slug: string, reference: string): Promise<FloorStatusResult> {
  const key = await deviceKeyOf(slug);
  return key ? floorStatus(slug, reference, key) : { ok: false, reason: "unknown" };
}

export async function floorReplyAction(slug: string, reference: string, text: string): Promise<FloorReplyResult> {
  const key = await deviceKeyOf(slug);
  if (!key) return { ok: false, reason: "unknown" };
  const result = await floorReply(slug, reference, text, key);
  if (result.ok) revalidatePath("/" + slug, "layout");
  return result;
}
