// Any page that throws while rendering, outside the company shell. A server error (it has a digest)
// was already counted by instrumentation.ts; one from the browser is reported from here, because
// React keeps an error a boundary caught away from window.onerror.
"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/report/error-reporter";
import { ErrorScreen } from "@/components/ui/ErrorScreen";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  return <ErrorScreen digest={error.digest} onRetry={retry} />;
}
