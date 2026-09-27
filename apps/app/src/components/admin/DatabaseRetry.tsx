"use client";
// Shown only while the database is configured but not answering. Re-renders the page on a short
// interval - the render itself asks Postgres again (databaseReport -> reconnectDatabase) - so the
// page switches to live data on its own once the database is back. The button does the same now.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";

const EVERY_MS = 5_000;

export function DatabaseRetry() {
  const router = useRouter();
  const [checking, startCheck] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  function check() {
    startCheck(() => {
      router.refresh();
      setCheckedAt(new Date());
    });
  }

  useEffect(() => {
    const id = setInterval(() => {
      // A background tab has nobody to show the answer to; the next focus checks straight away.
      if (document.visibilityState === "visible") check();
    }, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // check only closes over stable values (router, startCheck, setCheckedAt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.retry}>
      <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={check} disabled={checking}>
        {checking ? "Checking…" : "Check now"}
      </button>
      <span className={styles.rowMeta} aria-live="polite">
        {checking
          ? "Asking Postgres…"
          : checkedAt
            ? `Still not answering at ${checkedAt.toLocaleTimeString("en-GB")}. Checking every ${EVERY_MS / 1000} s.`
            : `Checking every ${EVERY_MS / 1000} s.`}
      </span>
    </div>
  );
}
