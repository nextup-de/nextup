"use client";
// The load of the desks on the Dashboard (plan OVL, D3, D28): one row per desk the viewer may see - its holders, the holder of the seat above it and an admin - with
// its open work, the work per present colleague, the late and pinned ones and its level. Sorted by the desk's title, never by a count; a desk, never a person. For a
// desk at up or overflow the seat above (or an admin) may add a holder (Settings, Org), appoint a cover (a present seat of another role, by its label) or pass cases on
// in bulk; none of these opens the away dialog (D28), and all three sit in the row's "···" menu. The actions are for a company with a database; the demo shows the
// rows only (D8). Quiet (DESIGN_RULES §2, §9): no 0 in a cell, a level only when the desk is loaded, and on the Dashboard one line that opens, drawn only while a desk is loaded.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Fold, RowMenu } from "@/components/ui/elements";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { seatAboveRole } from "@/features/cases/sheets";
import { seatPresent } from "@/features/overload/away";
import { deskRows, type DeskRow } from "@/features/overload/bulk";
import { deskLoads } from "@/features/overload/load";
import type { DeskLevel } from "@/features/overload/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { shows } from "@/lib/utils/quiet";
import { appointCover } from "@/server/actions/overload";
import { BulkBar } from "./BulkBar";
import styles from "./DeskLoadCard.module.css";

const LEVEL: Record<Exclude<DeskLevel, "normal">, MessageKey> = { triage: "overload.load.triage", up: "overload.load.up", overflow: "overload.load.overflow" };
const count = (n: number) => (shows(n) ? n : null);

/**
 * `shareOnly`: the card in the Inbox of someone who cannot open the Dashboard (OVL D36): only the desks the viewer may share the load of (`mayShareLoad`, the same
 * rule that enables the actions), and only on a company with a database, where the actions exist. Nobody without that right sees it there.
 */
export function DeskLoadCard({ shareOnly = false }: { shareOnly?: boolean }) {
  const t = useT();
  const { S, seed, role, actorUserId, serverMode, href, showToast } = useDemo();
  const all = deskRows(deskLoads(S, S.day), { userId: actorUserId, role }, S, (roleId) => seatAboveRole(seed.seats, seed.roles ?? [], roleId)?.id ?? null);
  const rows = shareOnly ? (serverMode ? all.filter((r) => r.canShare) : []) : all;
  const loaded = rows.filter((r) => r.level !== "normal").length;
  if (rows.length === 0 || (!shareOnly && loaded === 0)) return null;
  const table = (
      <table className={styles.table} data-testid="desk-load">
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
                <div className={styles.deskCell}>
                  {r.title}
                  {r.canShare && serverMode && <Share row={r} href={href} onSaved={() => showToast(t("overload.load.coverSaved"))} />}
                </div>
              </td>
              <td>{count(r.open)}</td><td>{count(r.perHolder)}</td><td>{count(r.late)}</td><td>{count(r.pinned)}</td>
              <td>{r.level !== "normal" && <span className={styles.level} data-level={r.level}>{t(LEVEL[r.level])}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
  );
  // In the Inbox sharing the load is the viewer's move, so the card stands open; on the Dashboard it waits behind its line.
  if (shareOnly) return <section className={styles.card}><h3 className={styles.title}>{t("overload.load.title")}</h3>{table}</section>;
  return <Fold name="desk-load" summary={t("overload.load.title")} meta={t("overload.load.loaded", { count: loaded })}>{table}</Fold>;
}

/** What the seat above does for a loaded desk, from the row's "···" menu: add a holder, appoint a cover, pass cases on in bulk. The open form shows under the desk's name. */
function Share({ row, href, onSaved }: { row: DeskRow; href: (p: string) => string; onSaved: () => void }) {
  const t = useT();
  const router = useRouter();
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
    <>
      <RowMenu label={t("overload.load.menu", { desk: row.title })} testId="desk-menu" actions={[
        { label: t("overload.load.addHolder"), onSelect: () => router.push(href("/settings/org") + "#role-" + row.roleId) },
        { label: t("overload.load.appointCover"), onSelect: () => setPanel("cover") },
        { label: t("overload.load.passBulk"), onSelect: () => setPanel("bulk") },
      ]} />
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
    </>
  );
}
