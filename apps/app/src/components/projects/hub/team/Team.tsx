"use client";
// Team in the card-and-row style of the redesign: the same people, rights and actions as TeamPanel.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { InvitePanel } from "../../draft/DraftInvites";
import { isAdministrator, MemberActions } from "../../MemberActions";
import { peopleOf, teamOf, useRights, useSend, withIds } from "../../parts";
import styles from "./Team.module.css";

export function Team({ p }: { p: ReducedProject }) {
  const { act, seed } = useDemo();
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const [add, setAdd] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const live = p.status !== "stopped" && p.status !== "recognised";
  const team = teamOf(p, seed.seats);
  const deptOf = (name: string) => seed.people.find((x) => x.name === name)?.dept ?? "";
  const onTeam = new Set(team.map((m) => m.userId));
  const others = peopleOf(seed.seats).filter((x) => !onTeam.has(x.userId));
  const load = (userId: string | null) => userId === null ? 0 : p.steps.filter((s) => s.ownerUserId === userId && s.column !== "done").length;
  const heirs = withIds(team.slice(1));

  return (
    <section className={styles.card} aria-labelledby={"team-" + p.id}>
      <div className={styles.head}>
        {/* Its section (or the page) carries the name: kept for screen readers only (DESIGN_RULES §9). */}
        <h2 id={"team-" + p.id} className="nh-sr">{t("projects.teamTitle")}</h2>
        <span className={styles.muted}>{t("projects.peopleCount", { count: team.length })}</span>
      </div>
      <ul className={styles.rows}>
        {team.map((m, k) => (
          <li key={m.userId ?? m.name} className={styles.row}>
            <PersonFace name={m.name} size="sm" />
            <span className={styles.grow}>{m.name}{k === 0 && <span className={styles.leadTag}>{t("projects.leadTag")}</span>}{isAdministrator(p, m.userId) && <span className={styles.leadTag}>{t("projects.adminTag")}</span>}</span>
            {deptOf(m.name) ? <DeptChip name={deptOf(m.name)} /> : null}
            <span className={styles.muted} title={t("projects.openStepsTheyOwn")}>{load(m.userId) ? t("projects.openCount", { count: load(m.userId) }) : ""}</span>
            {k > 0 && m.userId !== null && live && <MemberActions p={p} who={{ userId: m.userId, name: m.name }} className={styles.quiet} />}
          </li>
        ))}
      </ul>
      {r.lead && live && others.length > 0 && (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); const who = others.find((x) => x.userId === add); if (who && send("project.member", { userId: who.userId, name: who.name }, () => act.project.member(p.id, who, true))) setAdd(""); }}>
          <select className={`nh-input nh-select ${styles.field} ${styles.grow}`} value={add} onChange={(e) => setAdd(e.target.value)} aria-label={t("projects.addToTeam")}>
            <option value="">{t("projects.addSomeone")}</option>
            {others.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!add}>{t("projects.add")}</button>
        </form>
      )}
      {r.hand && heirs.length > 0 && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); const next = heirs.find((x) => x.userId === to); if (next && send("project.handed", { toUserId: next.userId, to: next.name }, () => act.project.hand(p.id, next, why.trim() || undefined))) { setTo(""); setWhy(""); } }} aria-label={t("projects.handOver")}>
          <select className={`nh-input nh-select ${styles.field}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("projects.newLead")}>
            <option value="">{t("projects.handTo")}</option>
            {heirs.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          {to && <input className={`nh-input ${styles.field}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projects.whyOptional")} aria-label={t("projects.whyHandOver")} />}
          {to && <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm">{t("projects.handOver")}</button>}
        </form>
      )}
      {p.draft && live && <InvitePanel p={p} />}
    </section>
  );
}
