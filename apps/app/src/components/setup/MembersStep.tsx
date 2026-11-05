"use client";
// Setup step 5: the first people, added or invited, and the vacant seats they can sit in. Through the
// same member and org actions as Settings -> Members. A login code that no mail carried shows once.
import { useActionState, useState } from "react";
import { ROLES } from "@/config/roles";
import type { Knowledge } from "@/features/knowledge";
import { useT } from "@/i18n/client";
import { addMemberAction, inviteMemberAction, type InviteState, type MemberRow } from "@/server/actions/members";
import { linkSeatAction } from "@/server/actions/settings/org";
import type { MemberOption } from "@/components/settings/OrgEditor";
import settings from "@/components/settings/settings.module.css";
import { PersonFace } from "@/components/ui/elements";
import { Added, AddedRow, Field, Refusal, StepCard, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

type Props = StepFormProps & { me: string; members: MemberRow[]; knowledge: Knowledge; options: MemberOption[] };

export function MembersStep({ slug, formId, onDirty, demo, me, members, knowledge: k, options }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"add" | "invite">("invite");
  const [round, setRound] = useState(0); // a new round gives an empty form
  const [state, act, pending] = useActionState<InviteState, FormData>(async (_prev, form) => {
    const r = form.get("intent") === "invite" ? await inviteMemberAction({}, form) : await addMemberAction({}, form);
    if (r.added?.code && !r.problems?.length) { setRound((n) => n + 1); onDirty(false); }
    return r;
  }, {});
  const { error, pending: linking, run } = useRun();
  const fresh = state.added?.code ? state.added : null;
  const vacant = k.holders.filter((h) => !h.userId);
  const roleTitle = (id: string) => k.roles.find((r) => r.id === id)?.title ?? "";

  return (
    <StepCard title={t("settingsSetup.cardMembers")} text={t("settingsSetup.cardMembersText")}>
      <Added>
        {members.filter((m) => m.active).map((m) => (
          <AddedRow key={m.id} testId={`setup-member-${m.id}`}
            name={<span className={s.person}><PersonFace name={m.name} size="sm" />{m.name}{m.id === me ? <span className={s.addedSub}>{t("settings.you")}</span> : null}</span>}
            side={<span>{m.role}</span>} />
        ))}
      </Added>
      {fresh && state.mailed === true ? <p className={s.fieldHelp} role="status">{t("settings.invited", { name: fresh.name })}</p> : null}
      {fresh && state.mailed === false ? <p className={s.refusal} role="alert">{t("settings.inviteMailFailed", { name: fresh.name, error: state.mailError ?? "" })}</p> : null}
      {fresh && state.mailed !== true ? (
        <div className={s.code} role="status" data-testid="setup-member-code">
          <strong>{t("settings.codeFor", { name: fresh.name })}</strong>
          <span className={s.mono}>{fresh.code}</span>
          <span className={s.fieldHelp}>{t("settings.codeGive", { name: fresh.name })} {t("settings.codeOnce")}</span>
        </div>
      ) : null}
      <span className={s.segment} role="group" aria-label={t("settingsSetup.addOrInvite")}>
        {(["add", "invite"] as const).map((x) => (
          <label key={x}>
            <input type="radio" name="setup-member-mode" checked={mode === x} onChange={() => setMode(x)} data-testid={`setup-member-mode-${x}`} />
            <span>{x === "add" ? t("settings.addBtn") : t("settings.inviteBtn")}</span>
          </label>
        ))}
      </span>
      <form key={round} id={formId} action={act} className={s.form} onInput={() => onDirty(true)}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="intent" value={mode} />
        <div className={s.pair}>
          <Field label={t("settings.name")}><input className={settings.input} name="name" required autoComplete="off" data-testid="setup-member-name" /></Field>
          <Field label={t("settings.workEmail")}><input className={settings.input} name="email" type="email" required autoComplete="off" data-testid="setup-member-email" /></Field>
        </div>
        <div className={s.pair}>
          <Field label={t("settings.department")}><input className={settings.input} name="dept" autoComplete="off" /></Field>
          <Field label={t("settings.role")}>
            <select className={settings.input} name="role" defaultValue="member" data-testid="setup-member-role">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        {state.problems?.map((p) => <p key={p} className={s.refusal} role="alert">{p}</p>)}
        <div className={s.formFoot}>
          <span className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : mode === "invite" ? t("settings.inviteNote") : t("settings.addNote")}</span>
          <button type="submit" className={s.secondary} disabled={pending || demo} data-testid="setup-member-add">
            {mode === "invite" ? t("settingsSetup.sendInvitation") : t("settings.addBtn")}
          </button>
        </div>
      </form>
      {vacant.length ? (
        <>
          <h3 className={s.subLabel}>{t("settingsSetup.vacantSeats")}</h3>
          <ul className={s.seats}>
            {vacant.map((h) => (
              <li key={h.id} className={s.vacantSeat} data-testid={`setup-vacant-${h.id}`}>
                <span className={s.seatName}>{roleTitle(h.roleId)}</span>
                <select className={settings.input} aria-label={t("settingsSetup.linkSeatTo", { seat: h.name })} value="" disabled={linking || demo} data-testid="setup-vacant-link"
                  onChange={(e) => { const v = e.target.value; if (v) run(() => linkSeatAction(slug, h.id, v)); }}>
                  <option value="">{t("settingsOrg.linkMember")}</option>
                  {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <Refusal error={error} />
        </>
      ) : null}
    </StepCard>
  );
}
