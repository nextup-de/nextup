// The per-area hooks of the append action (plan REG, decision D18): types only, nothing that imports the database.
import type { EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import type { Locale } from "@/i18n";

/** What appendEventAction knows when it reaches the hooks: the viewer, the event as sent, and the state it is appended to. */
export type AppendCtx = {
  companyId: string;
  viewer: { userId: string; role: string };
  type: AppEventType;
  target: string | null;
  payload: EventPayload;
  state: State;
  seed: Seed;
  locale: Locale;
};

/** A hook either hands the (possibly stamped) payload on or refuses the event with its message. */
export type AppendHook = { ok: true; payload: EventPayload } | { ok: false; error: string };
