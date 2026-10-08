// A page inside the company shell that throws: the nav stays, the page's place shows what happened.
// Reporting as in src/app/error.tsx.
"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/report/error-reporter";
import { ErrorScreen } from "@/components/ui/ErrorScreen";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  return <ErrorScreen digest={error.digest} onRetry={retry} inShell />;
}
