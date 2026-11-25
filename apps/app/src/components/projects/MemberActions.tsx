"use client";
// What the viewer may do with one person on the team: ask them to co-lead, end that role, take them off.
// Each button asks the server's own rules about this person, so nobody sees one that would be refused.
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend, type Person } from "./parts";
import styles from "./MemberActions.module.css";

/** On the team, and took the lead's invitation as co-lead. */
export const isCoLead = (p: ReducedProject, userId: string | null): boolean =>
  userId !== null && p.memberUserIds.includes(userId) && (p.coLeadUserIds ?? []).includes(userId);

export function MemberActions({ p, who, className, below = false }: { p: ReducedProject; who: Person; className: string; below?: boolean }) {
  const { act } = useDemo();
  const t = useT();
  const { check } = useRights(p);
  const send = useSend(p);
  const co = isCoLead(p, who.userId);
  const asked = p.invites.some((i) => i.userId === who.userId && i.role === "colead" && i.state === "pending");
  const ask = { userId: who.userId, role: "colead" as const };
  const end = { userId: who.userId, name: who.name, coLead: false };
  const off = { userId: who.userId, name: who.name, on: false, unassign: true };
  return (
    <span className={styles.actions} data-below={below ? "true" : undefined}>
      {!co && !asked && check("project.invited", ask).ok && (
        <button type="button" className={className} aria-label={t("projects.coLeadAskLabel", { name: who.name })} onClick={() => send("project.invited", ask, () => act.project.invite(p.id, who.userId, "colead"))}>
          {t("projects.coLeadAsk")}
        </button>
      )}
      {/* A project that shows its invitations (InvitePanel) says there that the person was asked. */}
      {co && check("project.member", end).ok && (
        <button type="button" className={className} aria-label={t("projects.coLeadOffLabel", { name: who.name })} onClick={() => send("project.member", end, () => act.project.coLeadOff(p.id, who))}>
          {t("projects.coLeadOff")}
        </button>
      )}
      {check("project.member", off).ok && (
        <button type="button" className={className} aria-label={t("projects.takeOffTeam", { name: who.name })} onClick={() => send("project.member", off, () => act.project.member(p.id, who, false))}>
          {t("projects.remove")}
        </button>
      )}
    </span>
  );
}
