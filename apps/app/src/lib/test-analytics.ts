// The browser side of user-test analytics (features/testing/analytics.ts has the rules). posthog-js is
// loaded only once a participant code is set, so nobody else downloads a byte of it.
import type { PostHog } from "posthog-js";
import { POSTHOG_UI, testEventFor, type TestAnalytics } from "@/features/testing/analytics";
import type { EventPayload } from "@/features/cases/events";

let ph: PostHog | null = null;
let starting = false;

export async function startTestAnalytics(config: TestAnalytics, tester: string): Promise<void> {
  if (ph || starting) return;
  starting = true;
  const { default: posthog } = await import("posthog-js").finally(() => { starting = false; });
  posthog.init(config.key, {
    api_host: config.ingest,
    ui_host: POSTHOG_UI,
    defaults: "2026-08-30",
    // The tab is the test: closing it ends the session, and nothing is kept in a cookie.
    persistence: "sessionStorage",
    person_profiles: "identified_only",
    capture_dead_clicks: true,
    session_recording: { maskAllInputs: true },
    enable_recording_console_log: true,
  });
  posthog.identify(tester);
  ph = posthog;
}

export function stopTestAnalytics(): void {
  ph?.opt_out_capturing();
  ph?.reset();
  ph = null;
}

/** A funnel step the page knows about (coach message, publish). A no-op outside a test. */
export function track(name: string, props: Record<string, string | number | boolean> = {}): void {
  ph?.capture(name, props);
}

/** Every case event appended in this browser, as its funnel step if it has one. */
export function trackCaseEvent(type: string, payload: EventPayload | undefined): void {
  if (!ph) return;
  const event = testEventFor(type, payload);
  if (event) ph.capture(event.name, event.props);
}
