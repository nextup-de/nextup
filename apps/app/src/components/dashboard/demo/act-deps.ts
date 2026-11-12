// What the demo's acts close over (plan REG, decision D14): DemoProvider builds one ActDeps and hands it to every area's
// acts, so a phase that adds an act in demo/<area>-acts.ts needs nothing new from the provider.
import type { EventLog, EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import type { AppendOutcome } from "@/server/actions/events";

/**
 * One append (DemoProvider's emit). Local mode writes straight to localStorage; server mode renders the event
 * optimistically and persists it. `id` is the event's own id, `draftId` the idea-studio draft a raise publishes.
 * Resolves with the server's answer once it has one (at once in local mode); most acts do not wait for it.
 */
export type Emit = (type: AppEventType, target: string | null, payload?: EventPayload, id?: string, draftId?: string) => Promise<AppendOutcome>;

export type ActDeps = {
  emit: Emit;
  S: State;
  seed: Seed;
  /** A session and Postgres behind the page; false = the localStorage demo. */
  serverMode: boolean;
  slug: string;
  /** The label the viewer acts under, and who they are by user id. */
  actor: string;
  actorUserId: string | null;
  log: EventLog;
};
