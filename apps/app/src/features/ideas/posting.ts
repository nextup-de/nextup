// Who an idea is posted as (decision Q1.7). A member chooses per raise, on the last look, between their anonymous
// handle and their name; the company sets which one is preselected (Settings -> Rules). Leaders and managers post
// by name, as before. Pure: the server (server/actions/events.ts) and the demo (DemoProvider) both decide with it.
import type { Role } from "@/config/roles";

export type PostAs = "handle" | "name";
export const POST_AS: readonly PostAs[] = ["handle", "name"];
/** What a company has until it chooses: the handle, as the works-agreement template describes (docs/compliance). */
export const DEFAULT_POST_AS: PostAs = "handle";

export type Poster = { role: Role; name: string; handle: string | null };

/** Only a member who has a handle has a choice; everyone else posts by name. */
export const choosesPosting = (who: Poster): boolean => who.role === "member" && !!who.handle;

/** The name a raise is posted under: `asName` is the raiser's choice, missing = the company's preselection. */
export function raiseLabel(who: Poster, asName: boolean | undefined, companyDefault: PostAs): string {
  if (!choosesPosting(who)) return who.name;
  return (asName ?? companyDefault === "name") ? who.name : (who.handle as string);
}

/** The label an event of someone other than a raiser carries: a member's handle if they have one, else the name. */
const usualLabel = (who: Poster): string => (who.role === "member" && who.handle ? who.handle : who.name);

/**
 * The label an event is stored under. A raise as chosen. Anything the raiser does on their own case after that
 * (an answer, a revision, a comment, a withdraw) under the same label the case was raised with, so the case never
 * links their handle to their name. Everything else as before.
 */
export function eventLabel(
  who: Poster & { userId: string | null },
  ev: { type: string; payload: { asName?: unknown } },
  target: { fromUserId: string | null; from: string } | undefined,
  companyDefault: PostAs,
): string {
  if (ev.type === "case.raised") return raiseLabel(who, typeof ev.payload.asName === "boolean" ? ev.payload.asName : undefined, companyDefault);
  if (target && who.userId !== null && target.fromUserId === who.userId && target.from) return target.from;
  return usualLabel(who);
}

/** Read the company rule's value; anything unknown is the default. */
export const postAsOf = (v: unknown): PostAs => (v === "name" || v === "handle" ? v : DEFAULT_POST_AS);
