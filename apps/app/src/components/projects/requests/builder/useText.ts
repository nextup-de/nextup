"use client";
import { BUILDER_KEYS, type BuilderTextKey } from "@/features/projects/form-builder";
import { useT } from "@/i18n/client";

/** The builder's words through the catalog: `text("save")`, `text("limits", { count, max })`. */
export function useText() {
  const t = useT();
  return (key: BuilderTextKey, params?: Record<string, string | number>): string => t(BUILDER_KEYS[key], params);
}
