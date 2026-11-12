// The agent area of the notify registries (REG D6, D10): a stub, nothing reads it until phase AGT fills it. AGT adds to this
// file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts).
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

export const AGENT_LOOP_TYPES = [] as const;
export const AGENT_LOOP_TEMPLATES: readonly string[] = [];
export const AGENT_FOLLOWS: Record<never, string> = {};
export const AGENT_REMINDER_KINDS = [] as const;
export const AGENT_REMINDER_TEXTS: Record<never, ReminderTextFn> = {};
export const AGENT_REMINDER_AUDIENCE: Record<never, ReminderAudienceFn> = {};
export const AGENT_DUTY_TEMPLATES = [] as const;
export const AGENT_LOOP_MAIL_TYPES = [] as const;
