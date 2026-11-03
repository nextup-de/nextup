"use client";
// The Members table: search and filters, one row per person, a ··· menu per row (new code, seats,
// second factor, deactivate / delete), and a drawer to add or invite a person. Every button posts a
// server action from src/server/actions/members.ts; a login code comes back once and is shown once.
import { useActionState, useEffect, useState, useTransition } from "react";
import { ROLES } from "@/config/roles";
import { memberPrivacyActions } from "@/features/privacy/member-menu";
import { shortName } from "@/features/settings/routing-view";
import { useFormat, useT } from "@/i18n/client";
import {
  addMemberAction,
  deactivateMemberAction,
  deleteMemberAction,
  inviteMemberAction,
  reactivateMemberAction,
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
import { PersonExportDialog } from "./PersonExportDialog";
import { PseudonymiseDialog } from "./PseudonymiseDialog";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import styles from "./MembersView.module.css";

type Props = { slug: string; me: string; members: MemberRow[]; freeSeats: SeatLabel[]; demo?: boolean; showHead?: boolean };
type Coded = CodeState & Pick<InviteState, "problems" | "warnings" | "mailed" | "mailError">;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
/** Closes the row menu a button sits in. */
const closeMenu = (el: HTMLElement) => el.closest("details")?.removeAttribute("open");

export function MembersView({ slug, me, members, freeSeats, demo, showHead = true }: Props) {
  const t = useT();
  const format = useFormat();
  const when = (iso: string) => format.date(iso, "day");
  const [roled, setRole, saving] = useActionState<RoleState, FormData>(setMemberRoleAction, {});
  const [adding, setAdding] = useState<"add" | "invite" | null>(null);
  const [copied, setCopied] = useState(false);
  // Adding a person and "New code" share one state, so the code on screen is always the latest.
  // A person added or invited closes the drawer; a refusal keeps it open with its problems.
  const [coded, codeAction, coding] = useActionState<Coded, FormData>(async (_prev, form) => {
    setCopied(false);
    if (form.get("intent") === "add") {
      const r = await addMemberAction({}, form);
      if (r.added?.code && !r.problems?.length) setAdding(null);
      return { ...r.added, problems: r.problems, warnings: r.warnings };
    }
    if (form.get("intent") === "invite") {
      const r = await inviteMemberAction({}, form);
      if (r.added?.code && !r.problems?.length) setAdding(null);
      return { ...r.added, problems: r.problems, warnings: r.warnings, mailed: r.mailed, mailError: r.mailError };
    }
    return issueMemberCodeAction({}, form);
  }, {});

  const [removed, removeAction, removing] = useActionState<RemoveState, FormData>(async (_prev, form) => {
    const intent = form.get("intent");
    if (intent === "reactivate") return reactivateMemberAction({}, form);
    return intent === "delete" ? deleteMemberAction({}, form) : deactivateMemberAction({}, form);
  }, {});
  const [seated, seatAction, seating] = useActionState<SeatState, FormData>(memberSeatAction, {});
  const [asking, setAsking] = useState<MemberRow | null>(null);
  const [seatsFor, setSeatsFor] = useState<MemberRow | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  // Managers who enrolled a second factor: only they can have it reset (ADM D19).
  const [enrolled, setEnrolled] = useState<string[]>([]);
  const [exporting, setExporting] = useState<MemberRow | null>(null);
  const [pseudonymising, setPseudonymising] = useState<MemberRow | null>(null);
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);
  const [askingTotp, setAskingTotp] = useState<MemberRow | null>(null);
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, startReset] = useTransition();
  useEffect(() => {
    if (demo) return;
    let live = true;
    enrolledManagersAction(slug).then((ids) => { if (live) setEnrolled(ids); }, () => {});
    return () => { live = false; };
  }, [slug, members, demo]);
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
  const q = query.trim().toLowerCase();
  const shown = members.filter((m) =>
    (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    && (!roleFilter || m.role === roleFilter)
    && (status === "all" || (status === "active") === m.active));
  const active = members.filter((m) => m.active).length;
  const seatsShown = seatsFor ? members.find((m) => m.id === seatsFor.id) ?? seatsFor : null;

  const hidden = (m: MemberRow) => (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={m.id} />
    </>
  );

  return (
    <div className={s.page} data-testid="settings-members">
      <div className={s.headRow}>
        {showHead ? <SettingsHead title={t("settings.membersTitle")} lede={t("settings.membersSummary", { people: format.number(members.length), active: format.number(active) })} /> : <span />}
        <span className={styles.headButtons}>
          <button type="button" className={s.soft} onClick={() => setAdding("add")} data-testid="settings-members-open-add">{t("settings.addBtn")}</button>
          <button type="button" className={s.save} onClick={() => setAdding("invite")} data-testid="settings-members-open-invite">{t("settings.inviteBtn")}</button>
        </span>
      </div>
      {demo ? <p className={s.cardHint} data-testid="settings-demo-note">{t("settingsCompany.demoData")}</p> : null}
      <p className={s.cardHint}>{members.some((m) => m.microsoft) ? t("settings.hintCodeMicrosoft") : t("settings.hintCode")} {t("settings.hintNewCode")}</p>

      {fresh && mailedOk ? <p className={s.cardHint} role="status">{t("settings.invited", { name: fresh.name })}</p> : null}
      {fresh && coded.mailed === false ? (
        <p className={s.fieldError} role="alert">{t("settings.inviteMailFailed", { name: fresh.name, error: coded.mailError ?? "" })}</p>
      ) : null}
      {fresh && !mailedOk ? (
        <div className={`${s.card} ${styles.code}`} role="status">
          <strong>{t("settings.codeFor", { name: fresh.name })}</strong>
          <div className={styles.codeRow}>
            <span className={styles.codeValue}>{fresh.code}</span>
            <button type="button" className={s.save}
              onClick={() => { navigator.clipboard?.writeText(fresh.code).then(() => setCopied(true), () => {}); }}>{copied ? t("settings.copied") : t("settings.copy")}</button>
          </div>
          <span className={s.cardHint}>{t("settings.codeGive", { name: fresh.name })} {t("settings.codeOnce")}</span>
        </div>
      ) : null}
      {coded.warnings?.map((w) => <p key={w} className={s.cardHint}>{w}</p>)}
      {coded.error ? <p className={s.fieldError} role="alert">{coded.error}</p> : null}
      {removed.error ? <p className={s.fieldError} role="alert">{removed.error}</p> : null}
      {removed.done ? <p className={s.cardHint} role="status">{removed.done}</p> : null}
      {seated.error ? <p className={s.fieldError} role="alert">{seated.error}</p> : null}
      {roled.error ? <p className={s.fieldError} role="alert">{roled.error}</p> : null}
      {totpMsg ? <p className={totpMsg.ok ? s.cardHint : s.fieldError} role={totpMsg.ok ? "status" : "alert"}>{totpMsg.text}</p> : null}
      {privacyMsg ? <p className={s.cardHint} role="status" data-testid="member-privacy-status">{privacyMsg}</p> : null}
      {roled.saved ? <p className={s.cardHint} role="status">{roled.saved}</p> : null}

      <div className={styles.toolbar}>
        <input className={s.input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("settings.searchMembers")} aria-label={t("settings.searchMembers")} />
        <select className={`${s.input} ${styles.filter}`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label={t("settings.filterRole")}>
          <option value="">{t("settings.filterAllRoles")}</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={`${s.input} ${styles.filter}`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("settings.filterStatus")}>
          <option value="all">{t("settings.statusAll")}</option>
          <option value="active">{t("settings.statusActive")}</option>
          <option value="inactive">{t("settings.statusInactive")}</option>
        </select>
      </div>

      {members.length <= 1 ? (
        <section className={`${s.card} ${styles.empty}`}>
          <h2 className={s.cardTitle}>{t("settings.onlyYouTitle")}</h2>
          <p className={s.cardHint}>{t("settings.onlyYouText")}</p>
        </section>
      ) : null}

      <section className={`${s.card} ${styles.tableCard}`}>
        <div className={`${styles.row} ${styles.th}`} aria-hidden="true">
          <span>{t("settings.colPerson")}</span><span>{t("settings.colDept")}</span><span>{t("settings.colRole")}</span>
          <span>{t("settings.colSeats")}</span><span>{t("settings.colSignIn")}</span><span />
        </div>
        {shown.length === 0 ? <p className={styles.noMatch}>{t("settings.noMatch", { q: query })}</p> : null}
        <ul className={styles.list}>
          {shown.map((m) => {
            const privacy = memberPrivacyActions(m, me);
            return (
            <li key={m.id} className={styles.row} data-inactive={m.active ? undefined : ""} data-testid={`settings-member-${m.id}`}>
              <span className={styles.who}>
                <span className={styles.avatar} data-me={m.id === me ? "" : undefined}>{initials(m.name)}</span>
                <span className={styles.whoText}>
                  <strong>{m.name}{m.id === me ? <span className={s.mute}> ({t("settings.you")})</span> : null}</strong>
                  <span className={styles.sub}>{m.pseudonymisedAt ? t("privacyPerson.rowPseudonymised", { date: when(m.pseudonymisedAt) }) : m.active ? m.email : t("settings.inactive")}</span>
                </span>
              </span>
              <span className={styles.cell} data-label={t("settings.colDept")}>{m.dept || "–"}</span>
              <span className={styles.cell} data-label={t("settings.colRole")}>
                {m.id === me || !m.active ? <span className={styles.roleText}>{m.role}</span> : (
                  <form action={setRole}>
                    {hidden(m)}
                    <select className={`${s.input} ${styles.roleSelect}`} name="role" defaultValue={m.role} aria-label={t("settings.roleOf", { name: m.name })}
                      disabled={saving || demo} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </form>
                )}
              </span>
              <span className={styles.cell} data-label={t("settings.colSeats")}>
                {m.seats.length === 0 ? "–" : (
                  <button type="button" className={styles.seatLink} onClick={() => setSeatsFor(m)}>
                    {m.seats[0].label}{m.seats.length > 1 ? <span className={s.mute}> +{m.seats.length - 1}</span> : null}
                  </button>
                )}
              </span>
              <span className={`${styles.cell} ${styles.sub}`} data-label={t("settings.colSignIn")}>
                {m.microsoft ? t("settings.microsoft") : m.codeIssuedAt ? t("settings.codeSince", { date: when(m.codeIssuedAt) }) : t("settings.noCode")}
              </span>
              {m.id === me && !m.active ? <span /> : (
                <details className={s.rowMenu}>
                  <summary aria-label={t("settings.memberMenu", { name: m.name })} data-testid={`settings-member-menu-${m.id}`}>···</summary>
                  <div className={s.menuList}>
                    {!privacy.deleteOnly && m.active ? (
                      <form action={codeAction} onSubmit={(e) => closeMenu(e.currentTarget)}>
                        <input type="hidden" name="slug" value={slug} />
                        <button type="submit" name="userId" value={m.id} disabled={coding || demo}>
                          {m.codeIssuedAt ? t("settings.newCode") : t("settings.issueCode")}
                        </button>
                      </form>
                    ) : null}
                    {!privacy.deleteOnly && m.active ? <button type="button" onClick={(e) => { closeMenu(e.currentTarget); setSeatsFor(m); }}>{t("settings.seatsMenu")}</button> : null}
                    {!privacy.deleteOnly && m.id !== me && m.role === "manager" && enrolled.includes(m.id) ? (
                      <button type="button" disabled={resetting} onClick={(e) => { closeMenu(e.currentTarget); setAskingTotp(m); }}>{t("settings.totpReset")}</button>
                    ) : null}
                    {privacy.exportTo.length > 0 ? (
                      <button type="button" disabled={demo} onClick={(e) => { closeMenu(e.currentTarget); setExporting(m); }} data-testid="member-export-open">{t("privacyPerson.menuExport")}</button>
                    ) : null}
                    {privacy.pseudonymise !== "hidden" ? (
                      <button type="button" className={s.danger} disabled={demo || privacy.pseudonymise === "disabled-active"}
                        title={privacy.pseudonymise === "disabled-active" ? t("privacyPerson.menuPseudonymiseActive", { name: m.name }) : undefined}
                        onClick={(e) => { closeMenu(e.currentTarget); setPseudonymising(m); }} data-testid="member-pseudonymise-open">{t("privacyPerson.menuPseudonymise")}</button>
                    ) : null}
                    {!privacy.deleteOnly && !m.active && m.id !== me ? (
                      <form action={removeAction} onSubmit={(e) => closeMenu(e.currentTarget)}>
                        {hidden(m)}
                        <button type="submit" name="intent" value="reactivate" disabled={removing || demo} data-testid={`settings-member-reactivate-${m.id}`}>{t("settings.reactivate")}</button>
                      </form>
                    ) : null}
                    {m.id !== me ? (
                      <button type="button" className={s.danger} disabled={removing} onClick={(e) => { closeMenu(e.currentTarget); setAsking(m); }}>
                        {m.active ? t("settings.deactivateMenu") : t("settings.deleteMenu")}
                      </button>
                    ) : null}
                  </div>
                </details>
              )}
            </li>
            );
          })}
        </ul>
      </section>

      {adding ? (
        <div className={s.scrim} onClick={() => setAdding(null)}>
          <form action={codeAction} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="member-drawer-title" onClick={(e) => e.stopPropagation()} data-testid="settings-members-drawer">
            <input type="hidden" name="slug" value={slug} />
            <div className={s.drawerHead}>
              <h2 id="member-drawer-title" className={s.drawerTitle}>{adding === "invite" ? t("settings.invitePerson") : t("settings.addPerson")}</h2>
              <button type="button" className={s.close} aria-label={t("settings.close")} onClick={() => setAdding(null)}>×</button>
            </div>
            <div className={s.drawerBody}>
              <label className={s.field}><span className={s.label}>{t("settings.name")}</span>
                <input className={s.input} name="name" required autoComplete="off" autoFocus /></label>
              <label className={s.field}><span className={s.label}>{t("settings.workEmail")}</span>
                <input className={s.input} name="email" type="email" required autoComplete="off" /></label>
              <label className={s.field}><span className={s.label}>{t("settings.department")}</span>
                <input className={s.input} name="dept" autoComplete="off" /></label>
              <label className={s.field}><span className={s.label}>{t("settings.role")}</span>
                <select className={s.input} name="role" defaultValue="member">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select></label>
              {coded.problems?.map((p) => <p key={p} className={s.fieldError} role="alert">{p}</p>)}
            </div>
            <div className={s.drawerFoot}>
              <span className={s.mute}>{adding === "invite" ? t("settings.inviteNote") : t("settings.addNote")}</span>
              <span className={s.dialogButtons}>
                <button type="button" className={s.soft} onClick={() => setAdding(null)}>{t("settings.cancel")}</button>
                <button type="submit" className={s.save} name="intent" value={adding} disabled={coding || demo}>
                  {adding === "invite" ? t("settings.invite") : t("settings.addAndIssue")}
                </button>
              </span>
            </div>
          </form>
        </div>
      ) : null}

      {seatsShown ? (
        <div className={s.scrim} onClick={() => setSeatsFor(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="seats-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="seats-title" className={s.cardTitle}>{t("settings.seatsOf", { name: shortName(seatsShown.name) })}</h2>
            <ul className={s.lines}>
              {seatsShown.seats.map((seat) => (
                <li key={seat.id} className={s.line}>
                  {seat.label}
                  <form action={seatAction}>
                    {hidden(seatsShown)}
                    <input type="hidden" name="seatId" value={seat.id} />
                    <input type="hidden" name="intent" value="unlink" />
                    <button className={s.lineAction} type="submit" disabled={seating || demo} aria-label={t("settings.unlinkSeat", { seat: seat.label })}>{t("settings.unlink")}</button>
                  </form>
                </li>
              ))}
            </ul>
            {seatsShown.seats.length === 0 ? <p className={s.empty}>{t("settings.noSeats")}</p> : null}
            {freeSeats.length > 0 ? (
              <form action={seatAction} className={s.field}>
                {hidden(seatsShown)}
                <span className={s.label}>{t("settings.linkVacant")}</span>
                <select className={s.input} name="seatId" defaultValue="" aria-label={t("settings.linkSeatOf", { name: seatsShown.name })}
                  disabled={seating || demo} onChange={(e) => { if (e.currentTarget.value) e.currentTarget.form?.requestSubmit(); }}>
                  <option value="">{t("settings.linkSeat")}</option>
                  {freeSeats.map((seat) => <option key={seat.id} value={seat.id}>{seat.label}</option>)}
                </select>
              </form>
            ) : null}
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setSeatsFor(null)}>{t("settings.close")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {asking ? (
        <div className={s.scrim} onClick={() => setAsking(null)}>
          <form action={(f) => { setAsking(null); removeAction(f); }} className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="remove-title" onClick={(e) => e.stopPropagation()}>
            {hidden(asking)}
            <input type="hidden" name="intent" value={asking.active ? "deactivate" : "delete"} />
            <h2 id="remove-title" className={s.cardTitle}>{t(asking.active ? "settings.deactivateAsk" : "settings.deleteAsk", { name: asking.name })}</h2>
            <p className={s.dialogText}>{asking.active ? t("settings.deactivateText") : t("settings.deleteText")}</p>
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setAsking(null)}>{t("settings.cancel")}</button>
              <button type="submit" className={s.dangerBtn} disabled={removing || demo}>
                {t("settings.confirm", { action: t(asking.active ? "settings.deactivate" : "settings.delete").toLowerCase() })}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {exporting ? (
        <PersonExportDialog slug={slug} member={exporting} exportTo={memberPrivacyActions(exporting, me).exportTo}
          onClose={() => setExporting(null)} onDone={(msg) => { setExporting(null); setPrivacyMsg(msg); }} />
      ) : null}
      {pseudonymising ? (
        <PseudonymiseDialog slug={slug} member={pseudonymising}
          onClose={() => setPseudonymising(null)} onDone={(msg) => { setPseudonymising(null); setPrivacyMsg(msg); }} />
      ) : null}

      {askingTotp ? (
        <div className={s.scrim} onClick={() => setAskingTotp(null)}>
          <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="totp-title" onClick={(e) => e.stopPropagation()}>
            <p id="totp-title" className={s.dialogText}>{t("settings.totpResetAsk", { name: askingTotp.name })}</p>
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setAskingTotp(null)}>{t("settings.cancel")}</button>
              <button type="button" className={s.dangerBtn} disabled={resetting} onClick={() => resetTotp(askingTotp)}>{t("settings.totpResetConfirm")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
