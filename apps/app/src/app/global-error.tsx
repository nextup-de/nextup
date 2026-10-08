// The root layout itself threw: this replaces the whole document, so it brings its own <html>,
// <body> and the global styles. Reporting as in src/app/error.tsx.
"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/report/error-reporter";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { SITE } from "@/config/site";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <title>{`Something broke · ${SITE.name}`}</title>
        <ErrorScreen digest={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}
