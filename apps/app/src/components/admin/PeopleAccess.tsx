"use client";
// The People card of /admin People: pick people in the dropdown, see them below, act on all of them at
// once. Only the chosen people are listed, so the card stays small in a company of any size.
import { useMemo, useState, useTransition } from "react";
import { issueLoginCodesAction, setStackAdminAction, type CompanyRow, type LoginCodeState } from "@/server/actions/admin";
import { adminResetTotpAction } from "@/server/actions/settings/totp-reset";
import { actionTargets, pageOf, peopleGroups, someNames, type PersonAction } from "@/features/admin/list";
import { ConfirmDialog, DataTable, PersonFace, type Column } from "@/components/ui/elements";
import type { MessageKey } from "@/i18n";
import { useFormat, useT } from "@/i18n/client";
import { PeoplePicker } from "./PeoplePicker";
import c from "@/app/admin/people/console.module.css";
import s from "./lists.module.css";

type Person = CompanyRow["persons"][number];
type IssuedCode = NonNullable<LoginCodeState["codes"]>[number];

const PAGE = 8;
const NAMES_IN_DIALOG = 5;

const ACTIONS: readonly { key: PersonAction; label: MessageKey; title: MessageKey; text: MessageKey; done: MessageKey; danger?: boolean }[] = [
  { key: "code", label: "adminConsole.actionCode", title: "adminConsole.askCodeTitle", text: "adminConsole.askCodeText", done: "adminConsole.doneCode" },
  { key: "grant", label: "adminConsole.actionGrant", title: "adminConsole.askGrantTitle", text: "adminConsole.askGrantText", done: "adminConsole.doneGrant" },
  { key: "revoke", label: "adminConsole.actionRevoke", title: "adminConsole.askRevokeTitle", text: "adminConsole.askRevokeText", done: "adminConsole.doneRevoke", danger: true },
  { key: "reset", label: "adminConsole.actionReset", title: "adminConsole.askResetTitle", text: "adminConsole.askResetText", done: "adminConsole.doneReset", danger: true },
];

export function PeopleAccess({ company }: { company: CompanyRow }) {
  const t = useT();
  const f = useFormat();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState<PersonAction | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const selected = useMemo(() => {
    const ids = new Set(picked);
    return company.persons.filter((p) => ids.has(p.id));
  }, [company.persons, picked]);
  const targets = actionTargets(selected);
  const groups = peopleGroups(company);
  const view = pageOf(selected, page, PAGE);
  const action = ACTIONS.find((a) => a.key === asking);

  const pick = (ids: readonly string[]) => { setPicked(ids); setPage(0); setNote(null); };

  const run = (a: (typeof ACTIONS)[number]) => {
    setAsking(null);
    setNote(null);
    const form = new FormData();
    form.set("slug", company.slug);
    for (const p of targets[a.key]) form.append("userId", p.id);
    if (a.key === "grant") form.set("stackAdmin", "on");
    start(async () => {
      try {
        const result =
          a.key === "code" ? await issueLoginCodesAction({}, form)
          : a.key === "reset" ? await adminResetTotpAction({}, form)
          : await setStackAdminAction({}, form);
        if (result.error) { setNote({ text: result.error, error: true }); return; }
        if ("codes" in result && result.codes) { setCodes(result.codes); setCopied(false); }
        setNote({ text: t(a.done) });
      } catch {
        setNote({ text: t("adminConsole.actionFailed"), error: true });
      }
    });
  };

  const copyCodes = async () => {
    await navigator.clipboard.writeText(codes.map((x) => `${x.name}\t${x.code}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const columns: Column<Person>[] = [
    {
      key: "person",
      header: t("adminConsole.colPerson"),
      width: "minmax(0, 1.8fr)",
      render: (p) => (
        <div className={c.who}>
          <PersonFace name={p.name} />
          <span className={c.whoText}>
            <span className={c.strong}>{p.name}{p.active ? null : <span className={s.tag}>{t("adminConsole.pickerInactive")}</span>}</span>
            <span className={c.sub}>{p.role} · {p.email}</span>
          </span>
        </div>
      ),
    },
    {
      key: "signin",
      header: t("adminConsole.colSignIn"),
      width: "minmax(0, 1fr)",
      render: (p) => (
        <>
          <span>{p.codeIssuedAt ? t("adminConsole.codeSince", { date: f.date(p.codeIssuedAt, "day") }) : t("adminConsole.codeNone")}</span>
          {p.microsoft ? <span className={c.sub}>{t("adminConsole.microsoftLinked")}</span> : null}
        </>
      ),
    },
    { key: "console", header: t("adminConsole.colStackAdmin"), width: "minmax(0, 0.7fr)", render: (p) => t(p.isStackAdmin ? "adminConsole.consoleOn" : "adminConsole.consoleOff") },
    { key: "factor", header: t("adminConsole.colSecondFactor"), width: "minmax(0, 0.7fr)", render: (p) => (p.hasTotp ? t("adminConsole.factorOn") : t("adminConsole.none")) },
    {
      key: "remove",
      header: "",
      width: "36px",
      render: (p) => (
        <button type="button" className={s.unpick} aria-label={t("adminConsole.selectedRemove", { name: p.name })} onClick={() => setPicked(picked.filter((id) => id !== p.id))}>×</button>
      ),
    },
  ];

  const dialogLines = (people: readonly Person[]) => {
    const { names, more } = someNames(people.map((p) => p.name), NAMES_IN_DIALOG);
    return more ? [...names, t("adminConsole.askMore", { n: more })] : names;
  };

  return (
    <>
      {codes.length ? (
        <div className={c.codeBox} data-testid="console-issued-codes">
          <strong>{t("adminConsole.codesTitle", { n: codes.length })}</strong>
          <p className={c.note}>{t("adminConsole.codesGive")}</p>
          <dl className={s.codes}>
            {codes.map((x) => (
              <div key={x.id} className={s.codeRow}>
                <dt>{x.name}</dt>
                <dd>{x.code}</dd>
              </div>
            ))}
          </dl>
          <div className={s.codesFoot}>
            <button type="button" className={c.btn} onClick={copyCodes}>{copied ? t("adminConsole.codesCopied") : t("adminConsole.codesCopy")}</button>
            <button type="button" className={c.btn} onClick={() => setCodes([])}>{t("adminConsole.codesDone")}</button>
          </div>
        </div>
      ) : null}

      <PeoplePicker people={company.persons} selected={picked} onChange={pick} />

      {groups.locked.length || groups.admins.length ? (
        <div className={s.groups}>
          {groups.locked.length ? (
            <button type="button" className={s.group} data-testid="console-group-locked" onClick={() => pick(groups.locked.map((p) => p.id))}>
              {t("adminConsole.groupLocked", { n: groups.locked.length })}
            </button>
          ) : null}
          {groups.admins.length ? (
            <button type="button" className={s.group} data-testid="console-group-admins" onClick={() => pick(groups.admins.map((p) => p.id))}>
              {t("adminConsole.groupAdmins", { n: groups.admins.length })}
            </button>
          ) : null}
        </div>
      ) : null}

      {note ? <p className={c.note} data-tone={note.error ? "error" : "ok"} role={note.error ? "alert" : "status"}>{note.text}</p> : null}

      {selected.length ? (
        <>
          <div className={s.actions} data-testid="console-people-actions">
            {ACTIONS.filter((a) => targets[a.key].length > 0).map((a) => (
              <button key={a.key} type="button" className={a.key === "code" ? c.primary : c.btn} disabled={pending} onClick={() => setAsking(a.key)}>
                {t(a.label, { n: targets[a.key].length })}
              </button>
            ))}
            <button type="button" className={`${s.link} ${s.actionsEnd}`} onClick={() => pick([])}>{t("adminConsole.selectedClear")}</button>
          </div>
          <DataTable
            testId="console-selected-people"
            columns={columns}
            rows={view.rows}
            rowKey={(p) => p.id}
            empty={t("adminConsole.none")}
            paging={view.pages > 1 ? {
              line: t("adminConsole.tablePager", { from: view.from, to: view.to, total: view.total }),
              prevLabel: t("adminConsole.tablePrev"),
              nextLabel: t("adminConsole.tableNext"),
              onPrev: view.page > 0 ? () => setPage(view.page - 1) : undefined,
              onNext: view.page < view.pages - 1 ? () => setPage(view.page + 1) : undefined,
            } : undefined}
          />
        </>
      ) : (
        <p className={c.note}>{t("adminConsole.pickerHint")}</p>
      )}

      {action ? (
        <ConfirmDialog
          title={t(action.title)}
          text={t(action.text, { n: targets[action.key].length, old: targets[action.key].filter((p) => p.codeIssuedAt).length })}
          lines={dialogLines(targets[action.key])}
          confirmLabel={t("adminConsole.askYes")}
          cancelLabel={t("adminConsole.askNo")}
          danger={action.danger}
          onConfirm={() => run(action)}
          onCancel={() => setAsking(null)}
          testId="console-people-dialog"
        />
      ) : null}
    </>
  );
}
