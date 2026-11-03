"use client";

// Starts user-test recording on a demo stack (features/testing/analytics.ts). Renders nothing.
// Open any page with ?tester=P01 to start; the code is kept for this tab only. ?tester=off stops it.
import { useEffect } from "react";
import { testerCode, type TestAnalytics as Config } from "@/features/testing/analytics";
import { startTestAnalytics, stopTestAnalytics } from "@/lib/test-analytics";

const KEY = "nextup.tester";

export function TestAnalytics({ config }: { config: Config }) {
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("tester");
    let tester: string | null = null;
    try {
      if (asked === "off") {
        sessionStorage.removeItem(KEY);
        stopTestAnalytics();
        return;
      }
      tester = testerCode(asked);
      if (tester) sessionStorage.setItem(KEY, tester);
      else tester = testerCode(sessionStorage.getItem(KEY));
    } catch {
      tester = testerCode(asked); // storage blocked: record this page only
    }
    if (tester) void startTestAnalytics(config, tester);
  }, [config]);
  return null;
}
