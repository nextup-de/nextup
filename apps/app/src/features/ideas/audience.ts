// What the raise page's "Who sees it" puts on the case. Pure. Public, the default, sends nothing, so the case
// follows the rule for no choice (features/cases/visibility). The names go to the server, which matches them to
// ids (lib/db/audience.ts); a custom choice with nobody picked is private rather than open.
import type { Visibility } from "@/features/cases/events";

export type AudienceChoice = { vis: "private" | "public" | "custom"; visTo: readonly string[] };

export function audienceOf(choice: AudienceChoice): { visibility?: Visibility; seenBy?: string[] } {
  if (choice.vis === "private" || (choice.vis === "custom" && choice.visTo.length === 0)) return { visibility: "private" };
  if (choice.vis === "custom") return { visibility: "custom", seenBy: [...choice.visTo] };
  return {};
}
