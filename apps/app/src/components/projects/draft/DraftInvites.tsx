"use client";
// Invitations to a project: invite by person and role, see every invitation with its state, answer your own, and the
// roles the template suggests as open slots (D12, P6.5). One part for two places: the draft page, and the Team tab of a
// project that has started, where the draft page is gone but a sponsor can still be named. An inbox link lands on the
// response itself (#invite-<id>).
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { hasClosedAudience } from "@/features/cases/visibility";
import { pendingInviteOf } from "@/features/projects/draft";
import type { Invite, InviteRole, ReducedProject } from "@/features/projects/types";
import { TEMPLATES } from "@/features/templates/library";
import { useT } from "@/i18n/client";
import { peopleOf, useRights, useSend } from "../parts";
import styles from "./Draft.module.css";

const ROLES: readonly InviteRole[] = ["sponsor", "member", "contributor", "follower"];

export function InvitePanel({ p }: { p: ReducedProject }) {
  const { act, seed, S, actorUserId } = useDemo();
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const [who, setWho] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const nameOf = (userId: string) => seed.seats.find((s) => s.userId === userId)?.label ?? userId;
  const mayInvite = r.check("project.invited", { userId: "-", role: "member" }).ok;
  const people = peopleOf(seed.seats).filter((x) => x.userId !== p.leadUserId);
  // Inviting someone on a private or custom idea lets them read it (Q5.14).
  const closed = S.cases.some((c) => p.sources.includes(c.id) && hasClosedAudience(c));
  const slots = p.template ? TEMPLATES[p.template.key as keyof typeof TEMPLATES]?.find((x) => x.version === p.template?.version)?.roles ?? [] : [];
  const mine = pendingInviteOf(p, actorUserId);

  return (
    <section className={styles.section} aria-labelledby={"invites-" + p.id}>
      <h2 id={"invites-" + p.id} className={styles.h2}>{t("projectDraft.teamTitle")}</h2>
      {p.invites.length === 0 && p.followerUserIds.length === 0 && <p className={styles.muted}>{t("projectDraft.teamNone")}</p>}
      <ul className={styles.list}>
        {p.invites.map((i) => (
          <InviteRow key={i.id} p={p} invite={i} name={nameOf(i.userId)} focus={mine?.id === i.id} />
        ))}
        {p.followerUserIds.map((u) => (
          <li key={"f:" + u} className={styles.row}>
            <span className={styles.grow}>{nameOf(u)} · {t("projectDraft.role_follower")}</span>
            <span className={styles.state} data-state="accepted">{t("projectDraft.teamAsFollower")}</span>
          </li>
        ))}
      </ul>
      {mayInvite && (
        <form
          className={styles.inline}
          aria-label={t("projectDraft.teamInvite")}
          onSubmit={(e) => {
            e.preventDefault();
            if (who && send("project.invited", { userId: who, role }, () => act.project.invite(p.id, who, role))) setWho("");
          }}
        >
          <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("projectDraft.teamPerson")}>
            <option value="">{t("projectDraft.teamPickPerson")}</option>
            {people.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          <select className={`nh-input nh-select ${styles.input}`} value={role} onChange={(e) => setRole(e.target.value as InviteRole)} aria-label={t("projectDraft.teamRole")}>
            {ROLES.map((x) => <option key={x} value={x}>{t(("projectDraft.role_" + x) as "projectDraft.role_member")}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!who}>{t("projectDraft.teamInvite")}</button>
        </form>
      )}
      {mayInvite && closed && <p className={styles.warn} role="note">{t("projectDraft.teamWarn")}</p>}
      {slots.length > 0 && (
        <div className={styles.slots}>
          <span className={styles.muted}>{t("projectDraft.teamOpenSlots")}</span>
          <ul className={styles.chips}>{slots.map((s) => <li key={s} className={styles.chip}>{s}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function InviteRow({ p, invite, name, focus }: { p: ReducedProject; invite: Invite; name: string; focus: boolean }) {
  const { act, actorUserId } = useDemo();
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLLIElement>(null);
  const mayAnswer = invite.state === "pending" && actorUserId !== null && invite.userId === actorUserId
    && r.check("project.invite.answered", { inviteId: invite.id, userId: invite.userId, take: true }).ok;
  // The inbox link ends in #invite-<id>: bring that response into view.
  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    if (decodeURIComponent(window.location.hash.slice(1)) === "invite-" + invite.id) ref.current.scrollIntoView({ block: "center" });
  }, [invite.id]);
  const role = t(("projectDraft.role_" + invite.role) as "projectDraft.role_member");
  const answer = (take: boolean) =>
    send("project.invite.answered", { inviteId: invite.id, userId: invite.userId, take, ...(!take && reason.trim() ? { reason: reason.trim() } : {}) },
      () => act.project.answerInvite(p.id, invite.id, invite.userId, take, reason.trim() || undefined));

  return (
    <li ref={ref} id={"invite-" + invite.id} className={styles.rowBlock} data-focus={focus ? "true" : undefined}>
      <div className={styles.row}>
        <span className={styles.grow}>{name} · {role}</span>
        <span className={styles.state} data-state={invite.state}>{t(("projectDraft.inviteState_" + invite.state) as "projectDraft.inviteState_pending")}</span>
      </div>
      {invite.state === "declined" && invite.reason && <p className={styles.muted}>{invite.reason}</p>}
      {mayAnswer && (
        <div className={styles.answer} role="group" aria-label={t("projectDraft.inviteYou", { role })}>
          <p className={styles.strong}>{t("projectDraft.inviteYou", { role })}</p>
          {!declining ? (
            <span className={styles.actionRow}>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => answer(true)}>{t("projectDraft.inviteAccept")}</button>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setDeclining(true)}>{t("projectDraft.inviteDecline")}</button>
            </span>
          ) : (
            <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); answer(false); }}>
              <input className={`nh-input ${styles.input} ${styles.grow}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("projectDraft.inviteDeclineWhy")} aria-label={t("projectDraft.inviteDeclineWhy")} maxLength={500} autoFocus />
              <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm">{t("projectDraft.inviteDeclineSend")}</button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
