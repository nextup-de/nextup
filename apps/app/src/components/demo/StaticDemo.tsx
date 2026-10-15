"use client";
// The static demo's frame (app/demo, docs/IDEAS.md "The demo page"): the app's own provider and shell
// over its own seed (features/demo/static-demo.ts), in local mode - no company, no session, no database.
// The event log, the idea drafts and the screenshots live in this browser only, under the slug "demo".
// The dev panel is on: "Viewing as" switches person in this browser, "Reset demo" goes back to the seed.
// Once the script's idea is published, the player (LoopPlayer) plays what happens to it next, step by step.
//
// Every visit starts from the seed: what was raised on the last visit is wiped when the page loads,
// before anything reads it, and everyone's earlier chats with the coach are put back. Module code
// runs once per page load, not on client-side navigation, so going from the raise page to the
// dashboard keeps what was just published.
import { DemoProvider, type TenantInfo } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";
import { LoopPlayer } from "@/components/demo/LoopPlayer";
import { staticDemoDrafts } from "@/features/demo/static-demo";
import type { Seed } from "@/features/demo/types";
import { clearPrefs, resetLog } from "@/lib/demo-log";
import { draftScope, localDrafts } from "@/lib/idea-drafts";
import { clearShots } from "@/lib/shots";

const SLUG = "demo";

if (typeof window !== "undefined") {
  resetLog(SLUG);
  clearPrefs(SLUG);
  for (const [owner, drafts] of Object.entries(staticDemoDrafts(new Date()))) localDrafts.replace(draftScope(SLUG, owner), drafts);
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
    demoTools: true,
    // No flags: the demo shows everything built - every flag has its demo default, on. The pinned
    // interview stack (demo.sellux.ch) changes only when Kevin promotes it (deploy.sh promote demo).
  };
  return (
    <DemoProvider tenant={tenant} seed={seed}>
      <AppShell>{children}</AppShell>
      <LoopPlayer slug={SLUG} />
    </DemoProvider>
  );
}
