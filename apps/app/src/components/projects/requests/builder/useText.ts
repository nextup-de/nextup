"use client";
import { builderText } from "@/features/projects/form-builder";
import { useLocale } from "@/i18n/client";

export function useText() {
  return builderText(useLocale());
}
