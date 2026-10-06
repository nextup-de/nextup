"use client";
// The static demo's frame (app/demo, docs/IDEAS.md "The demo page"): the app's own provider and shell
// over its own seed (features/demo/static-demo.ts), in local mode - no company, no session, no database.
// The event log, the idea drafts and the screenshots live in this browser only, under the slug "demo".
// The dev panel is on: "Viewing as" switches person in this browser, "Reset demo" goes back to the seed.
//
// Every visit starts from the seed: what was raised on the last visit is wiped when the page loads,
// before anything reads it, and everyone's earlier chats with the coach are put back. Module code
// runs once per page load, not on client-side navigation, so going from the raise page to the
// dashboard keeps what was just published.
import { useEffect } from "react";
import { DemoProvider, useDemo, type TenantInfo } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";
import { appendEvent } from "@/features/cases/events";
import { staticDemoDrafts } from "@/features/demo/static-demo";
import type { Seed } from "@/features/demo/types";
import { DEMO_SCRIPT, DESK_REPLY } from "@/features/ideas/demo-script";
import { clearPrefs, resetLog, updateLog } from "@/lib/demo-log";
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
  };
  return (
    <DemoProvider tenant={tenant} seed={seed}>
      <DeskReply />
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}

// The script's case, once published, gets read and one question from whoever received it (DESK_REPLY) -
// written straight into this browser's log as that person, the way the local demo stores every event.
function DeskReply() {
  const { S } = useDemo();
  const waiting = S.cases.find((c) => !c.seed && c.title === DEMO_SCRIPT[0].say && c.status === "open" && !c.question && c.read === null);
  const id = waiting?.id, by = waiting?.assignee;
  useEffect(() => {
    if (!id || !by) return;
    const t = setTimeout(() => updateLog(SLUG, (log) =>
      appendEvent(appendEvent(log, { type: "case.read", actor: by, target: id }), { type: "case.asked", actor: by, target: id, payload: { text: DESK_REPLY.text } })), DESK_REPLY.afterMs);
    return () => clearTimeout(t);
  }, [id, by]);
  return null;
}
