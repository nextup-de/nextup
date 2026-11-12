// The approval area of the notify registries (REG D6, D10): a stub, nothing reads it until phase GAT fills it. GAT adds to this
// file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts).
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

export const APPROVAL_LOOP_TYPES = [] as const;
export const APPROVAL_LOOP_TEMPLATES: readonly string[] = [];
export const APPROVAL_FOLLOWS: Record<never, string> = {};
export const APPROVAL_REMINDER_KINDS = [] as const;
export const APPROVAL_REMINDER_TEXTS: Record<never, ReminderTextFn> = {};
export const APPROVAL_REMINDER_AUDIENCE: Record<never, ReminderAudienceFn> = {};
export const APPROVAL_DUTY_TEMPLATES = [] as const;
export const APPROVAL_LOOP_MAIL_TYPES = [] as const;
