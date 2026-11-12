// The overload area of the notify registries (REG D6, D10): a stub, nothing reads it until phase OVL fills it. OVL adds to this
// file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts).
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

export const OVERLOAD_LOOP_TYPES = [] as const;
export const OVERLOAD_LOOP_TEMPLATES: readonly string[] = [];
export const OVERLOAD_FOLLOWS: Record<never, string> = {};
export const OVERLOAD_REMINDER_KINDS = [] as const;
export const OVERLOAD_REMINDER_TEXTS: Record<never, ReminderTextFn> = {};
export const OVERLOAD_REMINDER_AUDIENCE: Record<never, ReminderAudienceFn> = {};
export const OVERLOAD_DUTY_TEMPLATES = [] as const;
export const OVERLOAD_LOOP_MAIL_TYPES = [] as const;
