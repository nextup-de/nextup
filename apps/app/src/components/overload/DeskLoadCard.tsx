"use client";
// The load of the desks on the Dashboard (plan OVL, D3, D28): one row per desk the viewer may see - its holders, the holder of the seat above it and an admin - with
// its open work, the work per present colleague, the late and pinned ones and its level. Sorted by the desk's title, never by a count; a desk, never a person. For a
// desk at up or overflow the seat above (or an admin) may add a holder (Settings, Org), appoint a cover (a present seat of another role, by its label) or pass cases on
// in bulk; none of these opens the away dialog (D28). The actions are for a company with a database; the demo shows the rows only (D8).
import Link from "next/link";
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { seatAboveRole } from "@/features/cases/sheets";
import { seatPresent } from "@/features/overload/away";
import { deskRows, type DeskRow } from "@/features/overload/bulk";
import { deskLoads } from "@/features/overload/load";
import type { DeskLevel } from "@/features/overload/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { appointCover } from "@/server/actions/overload";
import { BulkBar } from "./BulkBar";
import styles from "./DeskLoadCard.module.css";

const LEVEL: Record<DeskLevel, MessageKey> = { normal: "overload.load.normal", triage: "overload.load.triage", up: "overload.load.up", overflow: "overload.load.overflow" };

export function DeskLoadCard() {
  const t = useT();
  const { S, seed, role, actorUserId, serverMode, href, showToast } = useDemo();
  const rows = deskRows(deskLoads(S, S.day), { userId: actorUserId, role }, S, (roleId) => seatAboveRole(seed.seats, seed.roles ?? [], roleId)?.id ?? null);
  if (rows.length === 0) return null;
  return (
    <section className={styles.card} data-testid="desk-load">
      <div className={styles.head}>
        <h3 className={styles.title}>{t("overload.load.title")}</h3>
        <p className={styles.lede}>{t("overload.load.lede")}</p>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("overload.load.desk")}</th><th scope="col">{t("overload.load.open")}</th><th scope="col">{t("overload.load.perHolder")}</th>
            <th scope="col">{t("overload.load.late")}</th><th scope="col">{t("overload.load.pinned")}</th><th scope="col">{t("overload.load.state")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.roleId} data-testid="desk-load-row" data-role={r.roleId} data-level={r.level}>
              <td className={styles.desk}>
                {r.title}
                {r.canShare && serverMode && <Share row={r} href={href} onSaved={() => showToast(t("overload.load.coverSaved"))} />}
              </td>
              <td>{r.open}</td><td>{r.perHolder}</td><td>{r.late}</td><td>{r.pinned}</td>
              <td><span className={styles.level} data-level={r.level}>{t(LEVEL[r.level])}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** What the seat above does for a loaded desk: add a holder, appoint a cover, pass cases on in bulk. */
function Share({ row, href, onSaved }: { row: DeskRow; href: (p: string) => string; onSaved: () => void }) {
  const t = useT();
  const { S, tenant } = useDemo();
  const [panel, setPanel] = useState<"cover" | "bulk" | null>(null);
  const [seatId, setSeatId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A cover is a present seat of another role, named by its label.
  const seats = S.seats.filter((s) => s.roleId !== row.roleId && s.userId !== null && seatPresent(S, s.id, S.day));
  const cases = S.cases.filter((c) => c.assigneeRoleId === row.roleId && (c.status === "open" || c.status === "discussion"));
  const appoint = () => start(async () => {
    const r = await appointCover({ slug: tenant.slug, roleId: row.roleId, seatId });
    if (r.done.length > 0) { setError(null); setPanel(null); setSeatId(""); onSaved(); } else setError(r.error ?? r.refused[0]?.error ?? t("overload.inbox.refused"));
  });
  return (
    <div data-testid="desk-share">
      <div className={styles.actions}>
        <Link href={href("/settings/org") + "#role-" + row.roleId} className={styles.link} data-testid="desk-add-holder">{t("overload.load.addHolder")}</Link>
        <button type="button" className={styles.button} aria-expanded={panel === "cover"} onClick={() => setPanel(panel === "cover" ? null : "cover")} data-testid="desk-appoint-cover">{t("overload.load.appointCover")}</button>
        <button type="button" className={styles.button} aria-expanded={panel === "bulk"} onClick={() => setPanel(panel === "bulk" ? null : "bulk")} data-testid="desk-pass-bulk">{t("overload.load.passBulk")}</button>
      </div>
      {panel === "cover" && (
        <div className={styles.panel}>
          <span className={styles.actions}>
            <select className={styles.select} value={seatId} onChange={(e) => setSeatId(e.target.value)} aria-label={t("overload.load.coverSeat")} data-testid="desk-cover-seat">
              <option value="">{t("overload.load.coverSeat")}</option>
              {seats.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button type="button" className={styles.button} disabled={pending || seatId === ""} onClick={appoint} data-testid="desk-cover-save">{t("overload.load.appointCover")}</button>
          </span>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      )}
      {panel === "bulk" && <div className={styles.panel}><BulkBar cases={cases} forDesk={row.roleId} choose /></div>}
    </div>
  );
}
