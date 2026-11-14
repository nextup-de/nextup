import type { Locale } from "@/i18n";
import de from "./text.de.json";
import en from "./text.en.json";

export type AnswerText = typeof en;
export const answerText = (locale: Locale): AnswerText => (locale === "de" ? de : en);
export const fill = (template: string, params: Record<string, string | number>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
