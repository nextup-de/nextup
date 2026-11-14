"use client";
import { REQUEST_EMPTY, REQUEST_KEYS, type RequestsTextKey } from "@/features/projects/requests-view";
import { useT } from "@/i18n/client";

/** The inbox's words through the catalog: `text("via", { form, date })`, `empty("new")`. */
export function useText() {
  const t = useT();
  const text = (key: RequestsTextKey, params?: Record<string, string | number>): string => t(REQUEST_KEYS[key], params);
  const empty = (filter: keyof typeof REQUEST_EMPTY): string => t(REQUEST_EMPTY[filter]);
  return { text, empty };
}
