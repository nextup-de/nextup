// The overload area of the notify registries (REG D6, D10; plan OVL, D22): the events of absence and overload that mail, and which template a person's
// existing switch covers. OVL adds to this file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts). Every
// list entry OVL's notices need is declared here once, so the REG guards change once; the audiences (who hears what, D22) and the texts come with OVL-N1,
// which writes them in this file and in features/loop/notice/overload.ts without changing a list. No new notify group: the loop templates join the
// existing `loop` group through LOOP_TEMPLATES, so no profile switch or preference value is built.
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

/** The events that mail: an absence, a desk that carries too much, the cover that was appointed, the end of it, and a seat whose holder left (D22). */
export const OVERLOAD_LOOP_TYPES = ["person.away", "desk.overloaded", "desk.covered", "desk.cleared", "org.seat.vacant"] as const;
/** The templates of those events, `loop.<type>`, except org.seat.vacant, which is a duty template (below). */
export const OVERLOAD_LOOP_TEMPLATES: readonly string[] = OVERLOAD_LOOP_TYPES.filter((t) => t !== "org.seat.vacant").map((t) => `loop.${t}`);
// A person's switch for case notices already covers them until they choose again (the group's older template, as the approval area does).
export const OVERLOAD_FOLLOWS: Record<string, string> = {
  "loop.person.away": "loop.case.decided", "loop.desk.overloaded": "loop.case.decided", "loop.desk.covered": "loop.case.decided", "loop.desk.cleared": "loop.case.decided",
};
export const OVERLOAD_REMINDER_KINDS = [] as const;
export const OVERLOAD_REMINDER_TEXTS: Record<never, ReminderTextFn> = {};
export const OVERLOAD_REMINDER_AUDIENCE: Record<never, ReminderAudienceFn> = {};
/** The notices nobody can switch off: a seat whose holder left tells the company admins at once (D30). */
export const OVERLOAD_DUTY_TEMPLATES = ["loop.org.seat.vacant"] as const;
export const OVERLOAD_LOOP_MAIL_TYPES = ["person.away", "desk.overloaded", "desk.covered", "desk.cleared", "org.seat.vacant"] as const;
