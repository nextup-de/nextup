"use client";
// The static demo's frame (app/demo, docs/IDEAS.md "The demo page"): the app's own provider and shell
// over the built-in seed, in local mode - no company, no session, no database. The event log, the idea
// drafts and the screenshots live in this browser only, under the slug "demo".
//
// Every visit starts from the seed: what was raised on the last visit is wiped when the page loads,
// before anything reads it. Module code runs once per page load, not on client-side navigation, so
// going from the raise page to the dashboard keeps what was just published.
import { DemoProvider, type TenantInfo } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";
import type { Seed } from "@/features/demo/types";
import { clearPrefs, resetLog } from "@/lib/demo-log";
import { localDrafts } from "@/lib/idea-drafts";
import { clearShots } from "@/lib/shots";

const SLUG = "demo";

if (typeof window !== "undefined") {
  resetLog(SLUG);
  clearPrefs(SLUG);
  localDrafts.clear(SLUG);
  clearShots(SLUG);
}

// `prefix`: "/demo", or "" on a stack that is the demo (features/tenant/urls staticDemoPrefix).
export function StaticDemo({ seed, prefix, children }: { seed: Seed; prefix: string; children: React.ReactNode }) {
  const tenant: TenantInfo = {
    slug: SLUG,
    prefix,
    name: "Demo company",
    // The employee posts under a handle, so their name gets no public profile link.
    hiddenPeople: seed.personas.filter((r) => r.who.handle).map((r) => r.who.name),
    demoTools: false, // no dev panel: nobody to switch to, nothing to reset but a reload
  };
  return (
    <DemoProvider tenant={tenant} seed={seed}>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
