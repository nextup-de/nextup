// The walk through the inbox (Kevin, 17 Nov 2026; DESIGN_RULES §4, §8): with an idea open, the inbox's side view lists
// every item that opens an idea, in the inbox's own order (Decide, then Approve or confirm, then Do my part, each as
// the list has it), one row per idea. A decide item opens in place in the inbox (?id=); every other item about an idea
// opens the idea's page. A project's own item leaves the Inbox, so it is no step of the walk.
import type { InboxAsk, InboxItem } from "./types";

/** One step of the walk: the idea, its title, whether it is late, and where it opens. */
export type WalkItem = { id: string; title: string; late: boolean; href: string; inPlace: boolean };

const ASKS: readonly InboxAsk[] = ["decide", "confirm", "part"];
const IDEA_PAGE = /^\/idea\?id=/;

/** A decide item is opened in the inbox's own pane, save a project's own (a stalled project, no lead) and a second look. */
export const opensInPlace = (i: InboxItem): boolean => i.projectId === undefined && i.kind !== "appeal";
/** The id an item opens by: its case, else the id after its kind ("idea:i3" → "i3"). */
export const openIdOf = (i: InboxItem): string => i.caseId ?? i.id.slice(i.id.indexOf(":") + 1);

export function inboxWalk(items: readonly InboxItem[]): WalkItem[] {
  const out: WalkItem[] = [];
  const seen = new Set<string>();
  for (const ask of ASKS) {
    for (const i of items) {
      if (i.ask !== ask) continue;
      const inPlace = ask === "decide" && opensInPlace(i);
      if (!inPlace && !IDEA_PAGE.test(i.href)) continue;
      const id = openIdOf(i);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, title: i.title, late: i.late, href: inPlace ? "/inbox?id=" + encodeURIComponent(id) : i.href, inPlace });
    }
  }
  return out;
}
