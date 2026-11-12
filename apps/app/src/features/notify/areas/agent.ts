// The agent area of the notify registries (REG D6, D10; plan AGT, D14): an accepted Unblock is a notice to the step's owner or the holders of the
// step's role. AGT adds to this file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts, server/loop-notice.ts). The notice's
// builder is features/loop/notice/agent.ts (AGT-K1); the agent has no reminders and no duty notices.
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

export const AGENT_LOOP_TYPES = ["agent.accepted"] as const;
export const AGENT_LOOP_TEMPLATES: readonly string[] = AGENT_LOOP_TYPES.map((t) => `loop.${t}`);
// A person's switch for the project notices already covers it until they choose again.
export const AGENT_FOLLOWS: Record<string, string> = { "loop.agent.accepted": "loop.project.member" };
export const AGENT_REMINDER_KINDS = [] as const;
export const AGENT_REMINDER_TEXTS: Record<never, ReminderTextFn> = {};
export const AGENT_REMINDER_AUDIENCE: Record<never, ReminderAudienceFn> = {};
export const AGENT_DUTY_TEMPLATES = [] as const;
export const AGENT_LOOP_MAIL_TYPES = ["agent.accepted"] as const;
