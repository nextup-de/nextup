"use client";
import { requestsText } from "@/features/projects/requests-view";
import { useLocale } from "@/i18n/client";

export function useText() {
  return requestsText(useLocale());
}
