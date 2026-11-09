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
import { AddButton, Added, AddedRow, Field, Refusal, StepCard, StepDrawer, StepSection, useRun, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

type Props = StepFormProps & { me: string; members: MemberRow[]; knowledge: Knowledge; options: MemberOption[] };

export function MembersStep({ slug, formId, demo, me, members, knowledge: k, options }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"add" | "invite">("invite");
  const [open, setOpen] = useState(false); // the add drawer; closing it drops what was typed
  const [seen, setSeen] = useState<InviteState | null>(null); // the answer there was when the drawer opened
  const [state, act, pending] = useActionState<InviteState, FormData>(async (_prev, form) => {
    const r = form.get("intent") === "invite" ? await inviteMemberAction({}, form) : await addMemberAction({}, form);
    if (r.added && !r.problems?.length) setOpen(false);
    return r;
  }, {});
  const { error, pending: linking, run } = useRun();
  const fresh = state.added?.code ? state.added : null;
  const vacant = k.holders.filter((h) => !h.userId);
  const roleTitle = (id: string) => k.roles.find((r) => r.id === id)?.title ?? "";

  return (
    <>
      <StepCard title={t("settingsSetup.cardMembers")} text={t("settingsSetup.cardMembersText")}
        action={<AddButton label={t("settingsSetup.addOrInvite")} onClick={() => { setSeen(state); setOpen(true); }} testId="setup-member-new" />}>
        <Added>
          {members.filter((m) => m.active).map((m) => (
            <AddedRow key={m.id} testId={`setup-member-${m.id}`}
              name={<span className={s.person}><PersonFace name={m.name} size="sm" />{m.name}{m.id === me ? <span className={s.addedSub}>{t("settings.you")}</span> : null}</span>}
              side={<>{m.held ? <span className={s.badge} data-testid="setup-member-held">{t("settingsSetupOpen.heldBadge")}</span> : null}<span>{m.role}</span></>} />
          ))}
        </Added>
        {state.held && state.added ? <p className={s.fieldHelp} role="status">{t("settingsSetupOpen.heldAdded", { name: state.added.name })}</p> : null}
        {fresh && state.mailed === true ? <p className={s.fieldHelp} role="status">{t("settings.invited", { name: fresh.name })}</p> : null}
        {fresh && state.mailed === false ? <p className={s.refusal} role="alert">{t("settings.inviteMailFailed", { name: fresh.name, error: state.mailError ?? "" })}</p> : null}
        {fresh && state.mailed !== true ? (
          <div className={s.code} role="status" data-testid="setup-member-code">
            <strong>{t("settings.codeFor", { name: fresh.name })}</strong>
            <span className={s.mono}>{fresh.code}</span>
            <span className={s.fieldHelp}>{t("settings.codeGive", { name: fresh.name })} {t("settings.codeOnce")}</span>
          </div>
        ) : null}
      </StepCard>
      {open ? (
        <StepDrawer title={t("settingsSetup.addOrInvite")} formId={formId} onClose={() => setOpen(false)}
          submitLabel={mode === "invite" ? t("settingsSetup.sendInvitation") : t("settings.addBtn")} disabled={pending || !!demo} testId="setup-member-drawer" submitTestId="setup-member-add">
          <span className={s.segment} role="group" aria-label={t("settingsSetup.addOrInvite")}>
            {(["add", "invite"] as const).map((x) => (
              <label key={x}>
                <input type="radio" name="setup-member-mode" checked={mode === x} onChange={() => setMode(x)} data-testid={`setup-member-mode-${x}`} />
                <span>{x === "add" ? t("settings.addBtn") : t("settings.inviteBtn")}</span>
              </label>
            ))}
          </span>
          <form id={formId} action={act} className={s.form}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="intent" value={mode} />
            <Field label={t("settings.name")}><input className={settings.input} name="name" required autoFocus autoComplete="off" data-testid="setup-member-name" /></Field>
            <Field label={t("settings.workEmail")}><input className={settings.input} name="email" type="email" required autoComplete="off" data-testid="setup-member-email" /></Field>
            <Field label={t("settings.department")}><input className={settings.input} name="dept" autoComplete="off" /></Field>
            <Field label={t("settings.role")}>
              <select className={settings.input} name="role" defaultValue="member" data-testid="setup-member-role">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            {state === seen ? null : state.problems?.map((p) => <p key={p} className={s.refusal} role="alert">{p}</p>)}
            <p className={s.fieldHelp}>{demo ? t("settingsCompany.demoData") : mode === "invite" ? t("settings.inviteNote") : t("settings.addNote")}</p>
          </form>
        </StepDrawer>
      ) : null}
      {vacant.length ? (
        <StepSection title={t("settingsSetup.vacantSeats")}>
          <ul className={`${s.seats} ${s.scrollBox}`}>
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
        </StepSection>
      ) : null}
    </>
  );
}
