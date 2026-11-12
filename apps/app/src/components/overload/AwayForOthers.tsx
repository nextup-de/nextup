"use client";
// "Set someone away" on the viewer's own profile (plan OVL, D19, D31): the people the viewer may set away - a company admin every active member, the holder of a seat
// the people directly below - each with their current or next span, Set (the dialog for that person) and End. The list comes from the server (listAwayTargets) and
// carries a name and a span, nothing else. Hidden in the demo (D8) and while nobody is listed.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import { endAway, listAwayTargets, type AwayTarget } from "@/server/actions/overload";
import { AwayDialog } from "./AwayDialog";
import styles from "./AwayForOthers.module.css";

/** More rows than this get a name filter. */
const FILTER_FROM = 10;

export function AwayForOthers() {
  const t = useT();
  const router = useRouter();
  const { serverMode, tenant, f } = useDemo();
  const slug = tenant.slug;
  const [targets, setTargets] = useState<AwayTarget[]>([]);
  const [filter, setFilter] = useState("");
  const [setting, setSetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = useCallback(() => { void listAwayTargets({ slug }).then(setTargets); }, [slug]);
  useEffect(() => { if (serverMode) load(); }, [serverMode, load]);
  if (!serverMode || targets.length === 0) return null;
  const shown = targets.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const end = (awayId: string) => start(async () => {
    const res = await endAway({ slug, awayId });
    if (res.ok) { setError(null); load(); router.refresh(); } else setError(res.error);
  });
  return (
    <SectionCard title={t("overload.away.othersTitle")} name="away-others">
      <div className={styles.stack} data-testid="away-others">
        {targets.length > FILTER_FROM ? <input className={styles.filter} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("overload.away.othersFilter")} aria-label={t("overload.away.othersFilter")} data-testid="away-others-filter" /> : null}
        <ul className={styles.rows}>
          {shown.map((p) => (
            <li key={p.userId} data-testid={`away-other-${p.userId}`}>
              <div className={styles.row}>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.span}>{p.span ? t("overload.away.now", { date: f(p.span.to) }) : ""}</span>
                <span className={styles.actions}>
                  <button type="button" className={styles.button} onClick={() => setSetting(setting === p.userId ? null : p.userId)} data-testid={`away-other-set-${p.userId}`}>{t("overload.away.save")}</button>
                  {p.span ? <button type="button" className={styles.button} disabled={pending} onClick={() => end(p.span!.awayId)} data-testid={`away-other-end-${p.userId}`}>{t("overload.away.end")}</button> : null}
                </span>
              </div>
              {setting === p.userId ? (
                <div className={styles.dialog}><AwayDialog forUserId={p.userId} forName={p.name} onDone={() => { setSetting(null); load(); router.refresh(); }} /></div>
              ) : null}
            </li>
          ))}
        </ul>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </SectionCard>
  );
}
