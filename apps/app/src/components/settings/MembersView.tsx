"use client";
// The Members table plus "add a person". Every button posts a server action from
// src/server/actions/members.ts; a login code comes back once and is shown once, here.
import { useActionState, useEffect, useState, useTransition } from "react";
import { ROLES } from "@/config/roles";
import { useFormat, useT } from "@/i18n/client";
import {
  addMemberAction,
  deactivateMemberAction,
  deleteMemberAction,
  inviteMemberAction,
  issueMemberCodeAction,
  memberSeatAction,
  setMemberRoleAction,
  type CodeState,
  type InviteState,
  type MemberRow,
  type RemoveState,
  type RoleState,
  type SeatLabel,
  type SeatState,
} from "@/server/actions/members";
import { enrolledManagersAction, resetTotpAction } from "@/server/actions/settings/totp-reset";
import styles from "./MembersView.module.css";

type Props = { slug: string; me: string; members: MemberRow[]; freeSeats: SeatLabel[] };
type Coded = CodeState & Pick<InviteState, "problems" | "warnings" | "mailed" | "mailError">;

export function MembersView({ slug, me, members, freeSeats }: Props) {
  const t = useT();
  const format = useFormat();
  const when = (iso: string) => format.date(iso, "day");
  const [roled, setRole, saving] = useActionState<RoleState, FormData>(setMemberRoleAction, {});
  // Adding a person and "New code" share one state, so the code on screen is always the latest.
  const [coded, codeAction, coding] = useActionState<Coded, FormData>(async (_prev, form) => {
    if (form.get("intent") === "add") {
      const r = await addMemberAction({}, form);
      return { ...r.added, problems: r.problems, warnings: r.warnings };
    }
    if (form.get("intent") === "invite") {
      const r = await inviteMemberAction({}, form);
      return { ...r.added, problems: r.problems, warnings: r.warnings, mailed: r.mailed, mailError: r.mailError };
    }
    return issueMemberCodeAction({}, form);
  }, {});

  const [removed, removeAction, removing] = useActionState<RemoveState, FormData>(async (_prev, form) => {
    return form.get("intent") === "delete" ? deleteMemberAction({}, form) : deactivateMemberAction({}, form);
  }, {});
  const [seated, seatAction, seating] = useActionState<SeatState, FormData>(memberSeatAction, {});
  const [asking, setAsking] = useState<string | null>(null);
  // Managers who enrolled a second factor: only they can have it reset (ADM D19).
  const [enrolled, setEnrolled] = useState<string[]>([]);
  const [askingTotp, setAskingTotp] = useState<string | null>(null);
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, startReset] = useTransition();
  useEffect(() => {
    let live = true;
    enrolledManagersAction(slug).then((ids) => { if (live) setEnrolled(ids); }, () => {});
    return () => { live = false; };
  }, [slug, members]);
  const resetTotp = (m: MemberRow) => {
    setAskingTotp(null);
    startReset(async () => {
      const r = await resetTotpAction(slug, m.id);
      if (r.ok) {
        setEnrolled((ids) => ids.filter((id) => id !== m.id));
        setTotpMsg({ ok: true, text: t("settings.totpResetDone", { name: m.name }) });
      } else setTotpMsg({ ok: false, text: t(r.error) });
    });
  };

  const fresh = coded.code && coded.name ? { name: coded.name, code: coded.code } : null;
  // The code is shown when no mail carried it, or the mail did not go out.
  const mailedOk = coded.mailed === true;

  return (
    <div className={styles.wrap}>
      <p className="nh-hint">
        {members.some((m) => m.microsoft) ? t("settings.hintCodeMicrosoft") : t("settings.hintCode")} {t("settings.hintNewCode")}
      </p>

      {fresh && mailedOk ? <p className="nh-hint" role="status">{t("settings.invited", { name: fresh.name })}</p> : null}
      {fresh && coded.mailed === false ? (
        <p className="nh-error" role="alert">{t("settings.inviteMailFailed", { name: fresh.name, error: coded.mailError ?? "" })}</p>
      ) : null}
      {fresh && !mailedOk ? (
        <div className={styles.code} role="status">
          <strong>{t("settings.codeFor", { name: fresh.name })}</strong>
          <span className={styles.codeValue}>{fresh.code}</span>
          <span className="nh-hint">{t("settings.codeGive", { name: fresh.name })}</span>
        </div>
      ) : null}
      {coded.warnings?.map((w) => <p key={w} className="nh-hint">{w}</p>)}
      {coded.error ? <p className="nh-error" role="alert">{coded.error}</p> : null}
      {removed.error ? <p className="nh-error" role="alert">{removed.error}</p> : null}
      {removed.done ? <p className="nh-hint" role="status">{removed.done}</p> : null}
      {seated.error ? <p className="nh-error" role="alert">{seated.error}</p> : null}
      {roled.error ? <p className="nh-error" role="alert">{roled.error}</p> : null}
      {totpMsg ? <p className={totpMsg.ok ? "nh-hint" : "nh-error"} role={totpMsg.ok ? "status" : "alert"}>{totpMsg.text}</p> : null}
      {roled.saved ? <p className="nh-hint" role="status">{roled.saved}</p> : null}

      <ul className={styles.list}>
        {members.map((m) => (
          <li key={m.id} className={styles.row}>
            <span className={styles.who}>
              <strong>{m.name}{m.id === me ? ` (${t("settings.you")})` : ""}</strong>
              {m.active ? null : <span className={styles.sub}>{t("settings.inactive")}</span>}
              <span className={styles.sub}>{m.email}{m.dept ? ` · ${m.dept}` : ""}</span>
            </span>
            <span className={styles.sub}>
              {m.codeIssuedAt ? t("settings.codeSince", { date: when(m.codeIssuedAt) }) : t("settings.noCode")}
              {m.microsoft ? ` · ${t("settings.microsoftLinked")}` : ""}
            </span>
            <span className={styles.seats}>
              <span className={styles.sub}>{t("settings.seats")}</span>
              {m.seats.length === 0 ? <span className={styles.sub}>{t("settings.noSeats")}</span> : null}
              {m.seats.map((s) => (
                <form key={s.id} action={seatAction} className={styles.role}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="userId" value={m.id} />
                  <input type="hidden" name="seatId" value={s.id} />
                  <input type="hidden" name="intent" value="unlink" />
                  <span className={styles.sub}>{s.label}</span>
                  <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={seating} aria-label={t("settings.unlinkSeat", { seat: s.label })}>×</button>
                </form>
              ))}
              {m.active && freeSeats.length > 0 ? (
                <form action={seatAction} className={styles.role}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="userId" value={m.id} />
                  <select
                    className="nh-select"
                    name="seatId"
                    defaultValue=""
                    aria-label={t("settings.linkSeatOf", { name: m.name })}
                    disabled={seating}
                    onChange={(e) => { if (e.currentTarget.value) e.currentTarget.form?.requestSubmit(); }}
                  >
                    <option value="">{t("settings.linkSeat")}</option>
                    {freeSeats.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </form>
              ) : null}
            </span>
            <form action={setRole} className={styles.role}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="userId" value={m.id} />
              <select
                className="nh-select"
                name="role"
                defaultValue={m.role}
                aria-label={t("settings.roleOf", { name: m.name })}
                disabled={saving || m.id === me}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </form>
            <form action={codeAction}>
              <input type="hidden" name="slug" value={slug} />
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" name="userId" value={m.id} disabled={coding}>
                {m.codeIssuedAt ? t("settings.newCode") : t("settings.issueCode")}
              </button>
            </form>
            {m.id !== me && m.role === "manager" && enrolled.includes(m.id) ? (
              askingTotp === m.id ? (
                <span className={styles.role}>
                  <span className={styles.sub}>{t("settings.totpResetAsk", { name: m.name })}</span>
                  <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" disabled={resetting} onClick={() => resetTotp(m)}>{t("settings.totpResetConfirm")}</button>
                  <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAskingTotp(null)}>{t("settings.cancel")}</button>
                </span>
              ) : (
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAskingTotp(m.id)} disabled={resetting}>{t("settings.totpReset")}</button>
              )
            ) : null}
            {m.id === me ? null : asking === m.id ? (
              <form action={(f) => { setAsking(null); removeAction(f); }} className={styles.role}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="userId" value={m.id} />
                <input type="hidden" name="intent" value={m.active ? "deactivate" : "delete"} />
                <span className={styles.sub}>{t(m.active ? "settings.deactivateAsk" : "settings.deleteAsk", { name: m.name })}</span>
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={removing}>
                  {t("settings.confirm", { action: t(m.active ? "settings.deactivate" : "settings.delete").toLowerCase() })}
                </button>
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAsking(null)}>{t("settings.cancel")}</button>
              </form>
            ) : (
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAsking(m.id)} disabled={removing}>
                {t(m.active ? "settings.deactivate" : "settings.delete")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form action={codeAction} className={styles.add}>
        <h2 className={styles.addTitle}>{t("settings.addTitle")}</h2>
        <input type="hidden" name="slug" value={slug} />
        <div className={styles.addFields}>
          <label className="nh-field">
            <span className="nh-label">{t("settings.name")}</span>
            <input className="nh-input" name="name" required autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">{t("settings.workEmail")}</span>
            <input className="nh-input" name="email" type="email" required autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">{t("settings.department")}</span>
            <input className="nh-input" name="dept" autoComplete="off" />
          </label>
          <label className="nh-field">
            <span className="nh-label">{t("settings.role")}</span>
            <select className="nh-select" name="role" defaultValue="member">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        {coded.problems?.map((p) => <p key={p} className="nh-error" role="alert">{p}</p>)}
        <div>
          <button className="nh-btn nh-btn-primary" type="submit" name="intent" value="add" disabled={coding}>{t("settings.addAndIssue")}</button>
          {" "}
          <button className="nh-btn nh-btn-ghost" type="submit" name="intent" value="invite" disabled={coding}>{t("settings.invite")}</button>
        </div>
      </form>
    </div>
  );
}
