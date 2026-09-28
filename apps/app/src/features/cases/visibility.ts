// Who sees a case in the lists by the raiser's choice (the View pill on the raise page). The raiser
// and the desk it lands on always see it - that is derive.canOpen's job; this answers for everyone
// else. null = the raiser made no choice (cases raised before the pill), so the old rule applies.
// Browser only for now: the events endpoint still sends every event to every viewer.
import type { Visibility } from "./events";

export type Viewer = { name: string; dept: string | null }; // dept: the viewer's department name, as the picker lists it

export function seesByChoice(visibility: Visibility | null, seenBy: readonly string[], viewer: Viewer): boolean | null {
  if (visibility === "everyone") return true;
  if (visibility === "private") return false;
  if (visibility === "custom") return seenBy.includes(viewer.name) || (viewer.dept !== null && seenBy.includes(viewer.dept));
  return null;
}
