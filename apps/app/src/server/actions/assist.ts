"use server";
// The employee's verdict on an assistant answer: "that solved it", or "raise it anyway" (which
// links the conversation to the case it became). Only ever on the viewer's own turns; without a
// session there is nothing stored to rate, so it quietly does nothing.
import { z } from "zod";
import { getViewerFor } from "@/features/auth/session";
import { hasDatabase } from "@/lib/db/client";
import { linkRaise, rateTurn } from "@/lib/db/assist";

const Rate = z.object({ slug: z.string().min(1), turnId: z.string().min(1).max(64), helpful: z.boolean() });
const Link = z.object({ slug: z.string().min(1), sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), caseId: z.string().min(1).max(64) });

export async function rateAssistAction(input: z.input<typeof Rate>): Promise<{ ok: boolean }> {
  const p = Rate.safeParse(input);
  if (!p.success || !hasDatabase()) return { ok: false };
  const viewer = await getViewerFor(p.data.slug);
  if (!viewer) return { ok: false };
  return { ok: await rateTurn(viewer.companyId, viewer.userId, p.data.turnId, p.data.helpful) };
}

export async function linkAssistRaiseAction(input: z.input<typeof Link>): Promise<{ ok: boolean }> {
  const p = Link.safeParse(input);
  if (!p.success || !hasDatabase()) return { ok: false };
  const viewer = await getViewerFor(p.data.slug);
  if (!viewer) return { ok: false };
  await linkRaise(viewer.companyId, viewer.userId, p.data.sessionId, p.data.caseId);
  return { ok: true };
}
