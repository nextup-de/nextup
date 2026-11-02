// The root layout itself threw: this replaces the whole document, so it brings its own <html>,
// <body> and the global styles. Reporting as in src/app/error.tsx.
"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/report/error-reporter";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { SITE } from "@/config/site";
import { useLocale, useT } from "@/i18n/client";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  const locale = useLocale();
  const t = useT();
  return (
    <html lang={locale}>
      <body>
        <title>{t("errors.crashTitle", { site: SITE.name })}</title>
        <ErrorScreen digest={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}
