// TODO(PLN-G1): move these strings into the message catalog (projectPlan.ts) once PLN-G1 has merged; until then the Timeline keeps them in two JSON files.
import type { Locale } from "@/i18n";
import de from "./text.de.json";
import en from "./text.en.json";

export type TimelineText = typeof en;

export const timelineText = (locale: Locale): TimelineText => (locale === "de" ? de : en);
export const fill = (template: string, params: Record<string, string | number>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
