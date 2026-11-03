"use server";
// The brain's routing proposal for an idea that was just published (docs/IDEAS.md). The page asks
// after the publish went through and before it appends case.raised; null = use the keyword row.
// Same rules as the idea turn route: the company comes from the page's own slug, and a signed-in
// company needs a signed-in viewer.
import { z } from "zod";
import { DEFAULT_CEILING } from "@/features/assist/classify";
import { getViewerFor } from "@/features/auth/session";
import type { BrainProposal } from "@/features/routing/brain";
import { aiGate, type AiPurpose } from "@/features/ai/gate";
import { aiSettings } from "@/features/ai/settings";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { loadAiSettings } from "@/lib/db/ai";
import { loadAiRouting, loadAssistSettings } from "@/lib/db/assist";
import { askBrain, askBrainCheckin, askBrainPlan, brainConfigured } from "@/server/brain";
import type { CheckinProposal, PlanProposal } from "@/features/projects/brain";
import { clientKey, throttle } from "@/server/throttle";

// The gate for one purpose (docs/plans AIP D6, D8) with the company's own key. Without a signed-in
// viewer (the local demo has no database) the demo rule applies: the settings come from the
// environment, and the gate only lets a demo stage through.
async function gateFor(slug: string, viewer: { companyId: string } | null, purpose: AiPurpose) {
  const stage = (await findTenant(slug))?.stage ?? "demo";
  if (!viewer) {
    return { gate: aiGate({ stage, hasDatabase: false, settings: aiSettings(null, process.env, stage), dpaSignedAt: null, purpose, assistantOn: false, aiRouting: false }), key: null, settings: null };
  }
  const [ai, settings, aiRouting] = await Promise.all([loadAiSettings(viewer.companyId, stage), loadAssistSettings(viewer.companyId), loadAiRouting(viewer.companyId)]);
  const gate = aiGate({ stage, hasDatabase: true, settings: ai.settings, dpaSignedAt: settings.dpaSignedAt, purpose, assistantOn: settings.enabled, aiRouting });
  return { gate, key: ai.key, settings };
}

const Input = z.object({ slug: z.string().min(1).max(64), title: z.string().trim().min(3).max(2000), body: z.string().max(100_000) }); // brainRequest clips to the brain's limits

export async function brainProposalAction(input: { slug: string; title: string; body: string }): Promise<BrainProposal | null> {
  if (!brainConfigured()) return null;
  const p = Input.safeParse(input);
  if (!p.success) return null;
  const viewer = hasDatabase() ? await getViewerFor(p.data.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) return null;
  if (await throttle("brainRoute", p.data.slug + ":" + (viewer?.userId ?? (await clientKey())))) return null;
  // Without a database (the local demo) there are no company settings: built-in masks, default ceiling.
  const { gate, key, settings } = await gateFor(p.data.slug, viewer, "routing");
  if (!gate.on) return null;
  return askBrain(gate, p.data.slug, { title: p.data.title, body: p.data.body }, { patterns: settings?.patterns ?? [], ceiling: settings?.ceiling ?? DEFAULT_CEILING }, { key });
}

// After the decision (docs/plans/2026-10-15_idea-to-project.md): proposals only, null = the page's
// own offline suggestion stands. Same rules as above: the page's slug, a signed-in viewer, a throttle.
const CaseInput = z.object({ slug: z.string().min(1).max(64), caseId: z.string().min(1).max(64), weak: z.array(z.string().max(80)).max(10).default([]) });

async function brainPolicy(slug: string) {
  const viewer = hasDatabase() ? await getViewerFor(slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) return null;
  if (await throttle("brainPlan", slug + ":" + (viewer?.userId ?? (await clientKey())))) return null;
  const { gate, key, settings } = await gateFor(slug, viewer, "brain");
  if (!gate.on) return null;
  return { gate, key, policy: { patterns: settings?.patterns ?? [], ceiling: settings?.ceiling ?? DEFAULT_CEILING } };
}

/** The first steps and the metric for the project an accepted idea became. */
export async function brainPlanAction(input: { slug: string; caseId: string }): Promise<PlanProposal | null> {
  if (!brainConfigured()) return null;
  const p = CaseInput.safeParse(input);
  const b = p.success ? await brainPolicy(p.data.slug) : null;
  return p.success && b ? askBrainPlan(b.gate, p.data.slug, p.data.caseId, b.policy, { key: b.key }) : null;
}

/** A draft of the check-in that ends a discussion's round. `weak`: the dials the analysis still finds weak. */
export async function brainCheckinAction(input: { slug: string; caseId: string; weak?: string[] }): Promise<CheckinProposal | null> {
  if (!brainConfigured()) return null;
  const p = CaseInput.safeParse(input);
  const b = p.success ? await brainPolicy(p.data.slug) : null;
  return p.success && b ? askBrainCheckin(b.gate, p.data.slug, p.data.caseId, p.data.weak, b.policy, { key: b.key }) : null;
}
