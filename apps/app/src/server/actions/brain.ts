"use server";
// The brain's routing proposal for an idea that was just published (docs/IDEAS.md). The page asks
// after the publish went through and before it appends case.raised; null = use the keyword row.
// Same rules as the idea turn route: the company comes from the page's own slug, and a signed-in
// company needs a signed-in viewer.
import { z } from "zod";
import { DEFAULT_CEILING } from "@/features/assist/classify";
import { getViewerFor } from "@/features/auth/session";
import type { BrainProposal } from "@/features/routing/brain";
import { hasDatabase } from "@/lib/db/client";
import { loadAssistSettings } from "@/lib/db/assist";
import { askBrain, brainConfigured } from "@/server/brain";
import { clientKey, throttle } from "@/server/throttle";

const Input = z.object({ slug: z.string().min(1).max(64), title: z.string().trim().min(3).max(2000), body: z.string().max(100_000) }); // brainRequest clips to the brain's limits

export async function brainProposalAction(input: { slug: string; title: string; body: string }): Promise<BrainProposal | null> {
  if (!brainConfigured()) return null;
  const p = Input.safeParse(input);
  if (!p.success) return null;
  const viewer = hasDatabase() ? await getViewerFor(p.data.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) return null;
  if (throttle("brainRoute", p.data.slug + ":" + (viewer?.userId ?? (await clientKey())))) return null;
  // Without a database (the local demo) there are no company settings: built-in masks, default ceiling.
  const settings = viewer ? await loadAssistSettings(viewer.companyId) : null;
  return askBrain(p.data.slug, { title: p.data.title, body: p.data.body }, { patterns: settings?.patterns ?? [], ceiling: settings?.ceiling ?? DEFAULT_CEILING });
}
