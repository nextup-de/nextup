// Product analytics for user tests on demo stacks only (nextup-context analysis 2026-11-03_user-testing-hypotheses).
// PostHog Cloud EU (Frankfurt) records what a test participant does, so we see where people get stuck.
//
// Three locks, all of which must open:
//   1. the company's stage keeps our own content (policyFor().demoData) - never a real company's people (HD5, BetrVG §87(1) 6);
//   2. the stack has POSTHOG_KEY set;
//   3. the browser was opened with ?tester=P01 - a participant who signed the consent. No code, nothing is loaded.
// The browser talks to /api/<company>/ingest only; that route forwards to PostHog and checks locks 1 and 2 itself.
// Events carry facts about the click, never what anyone wrote.
import { policyFor } from "@/features/admin/stages";
import type { EventPayload } from "@/features/cases/events";

export const POSTHOG_API = "https://eu.i.posthog.com";
export const POSTHOG_ASSETS = "https://eu-assets.i.posthog.com";
export const POSTHOG_UI = "https://eu.posthog.com";

export type TestAnalytics = { key: string; ingest: string };

/** What the browser needs to record a test, or null when this company must not be recorded. */
export function testAnalyticsFor(slug: string, stage: string | undefined, key: string | undefined): TestAnalytics | null {
  if (!key || !policyFor(stage ?? "demo").demoData) return null;
  return { key, ingest: `/api/${slug}/ingest` };
}

/** A participant code from the URL: P01-P999. Anything else is no code. */
export function testerCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase() ?? "";
  return /^P\d{2,3}$/.test(code) ? code : null;
}

/** Where an ingest path goes at PostHog; null for anything that is not a plain relative path. */
export function upstreamFor(path: readonly string[], search: string): string | null {
  if (path.length === 0 || path.some((p) => p === "" || p === "." || p === ".." || /[/\\?#]/.test(p))) return null;
  // Scripts (the SDK's lazy parts, the project's remote config) come from the assets host, everything else from the API.
  const host = path[0] === "static" || path[0] === "array" ? POSTHOG_ASSETS : POSTHOG_API;
  return `${host}/${path.map(encodeURIComponent).join("/")}${search}`;
}

export type TestEvent = { name: string; props: Record<string, string | number | boolean> };

/** The test event for one case event, or null when the event is not part of a test funnel. */
export function testEventFor(type: string, payload: EventPayload | undefined): TestEvent | null {
  const p = payload ?? {};
  switch (type) {
    case "case.raised":
      return { name: "case_published", props: { kind: p.kind ?? "idea", routeAsProposed: p.proposal?.routeId != null && p.proposal.routeId === p.routeId, attachments: p.attachments ?? 0 } };
    case "case.read":
      return { name: "case_opened", props: {} };
    case "case.decided":
      return { name: "case_answered", props: { answer: p.answer ?? "yes", reasoned: Boolean(p.reason?.trim()) } };
    case "case.handed":
      return { name: "case_answered", props: { answer: "handover", reasoned: Boolean(p.why?.trim()) } };
    case "case.override":
      return { name: "owner_overridden", props: {} };
    case "case.asked":
      return { name: "case_question_asked", props: {} };
    default:
      return null;
  }
}
