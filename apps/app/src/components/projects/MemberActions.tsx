"use client";
// What the viewer may do with one person on the team: make them an administrator, take the role back, take them off.
// Each button asks the server's own rules about this person, so nobody sees one that would be refused.
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend, type Person } from "./parts";
import styles from "./MemberActions.module.css";

/** On the team and named an administrator by the lead. */
export const isAdministrator = (p: ReducedProject, userId: string | null): boolean =>
  userId !== null && p.memberUserIds.includes(userId) && (p.adminUserIds ?? []).includes(userId);

export function MemberActions({ p, who, className, below = false }: { p: ReducedProject; who: Person; className: string; below?: boolean }) {
  const { act } = useDemo();
  const t = useT();
  const { check } = useRights(p);
  const send = useSend(p);
  const admin = isAdministrator(p, who.userId);
  const role = { userId: who.userId, name: who.name, admin: !admin };
  const off = { userId: who.userId, name: who.name, on: false, unassign: true };
  return (
    <span className={styles.actions} data-below={below ? "true" : undefined}>
      {check("project.member", role).ok && (
        <button type="button" className={className} aria-label={t(admin ? "projects.adminOffLabel" : "projects.adminOnLabel", { name: who.name })} onClick={() => send("project.member", role, () => act.project.admin(p.id, who, !admin))}>
          {t(admin ? "projects.adminOff" : "projects.adminOn")}
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
