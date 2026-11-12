"use client";
// "No lead": the lead left and nobody leads yet (D14). Whoever may name a new lead (the sponsor, the desk that said yes, the
// decider, a manager) picks a person from the team or the company's people; one project.lead.changed event.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Banner } from "@/components/ui/elements";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { peopleOf, teamOf, useSend, withIds, type Person } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

export function NoLeadBanner({ p }: { p: ReducedProject }) {
  const { act, seed } = useDemo();
  const t = useT();
  const v = useMoveView(p);
  const send = useSend(p);
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  if (!v.noLead) return null;

  // The team first, then everyone else the company has a person for, once each.
  const seen = new Set<string>();
  const people: Person[] = [...withIds(teamOf(p, seed.seats).slice(1)), ...peopleOf(seed.seats)].filter((x) => !seen.has(x.userId) && seen.add(x.userId));

  return (
    <div className={styles.stack} data-testid="no-lead">
      <Banner tone="warn">
        <strong>{t("projectMove.noLead")}</strong> · {v.canNameLead ? t("projectMove.noLeadText") : t("projectMove.noLeadWho")}
      </Banner>
      {v.canNameLead && (
        <form
          className={styles.form} aria-label={t("projectMove.nameLeadSave")}
          onSubmit={(e) => { e.preventDefault(); const next = people.find((x) => x.userId === to); if (next && send("project.lead.changed", { toUserId: next.userId, to: next.name, ...(why.trim() ? { why: why.trim() } : {}) }, () => act.project.changeLead(p.id, next, why.trim() || undefined))) { setTo(""); setWhy(""); } }}
        >
          <select className={`nh-input nh-select ${styles.input}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("projectMove.nameLeadLabel")}>
            <option value="">{t("projectMove.nameLeadPick")}</option>
            {people.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          {to && <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projectMove.nameLeadWhy")} aria-label={t("projectMove.nameLeadWhy")} maxLength={400} />}
          {to && <span className={styles.row}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projectMove.nameLeadSave")}</button></span>}
        </form>
      )}
    </div>
  );
}
