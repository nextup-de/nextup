"use client";
// The routing table: one row per request type with its owner, deputy and buddy role and the wait.
// A test box shows which row the keywords would propose. A drawer adds or edits a route; the row
// menu moves or deletes it. Every change calls an action from src/server/actions/settings/org.ts.
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { holdersOfRole, type Knowledge, type RoleRow, type RuleRow } from "@/features/knowledge";
import { keywordHits, propose } from "@/features/routing";
import { routeKeyFor, routingSummary, seatLine } from "@/features/settings/routing-view";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { moveRouteAction, removeRouteAction, saveRouteAction, type OrgResult } from "@/server/actions/settings/org";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import r from "./RoutingEditor.module.css";

type Props = { slug: string; knowledge: Knowledge; demo?: boolean; showHead?: boolean };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);
const splitWords = (v: string) => v.split(",").map((w) => w.trim()).filter(Boolean);
/** Closes the row menu a button sits in. */
const closeMenu = (el: HTMLElement) => el.closest("details")?.removeAttribute("open");

/** Keywords as chips. A comma or Enter makes a chip; the form sends the chips plus what is still typed. */
export function KeywordInput({ initial, invalid }: { initial: string[]; invalid: boolean }) {
  const t = useT();
  const [words, setWords] = useState(initial);
  const [draft, setDraft] = useState("");
  const commit = (v: string) => {
    const next = splitWords(v).filter((w) => !words.includes(w));
    if (next.length) setWords([...words, ...next]);
    setDraft("");
  };
  return (
    <div className={s.words} data-invalid={invalid || undefined}>
      <input type="hidden" name="keywords" value={[...words, ...splitWords(draft)].join(",")} />
      {words.map((w) => (
        <span key={w} className={s.chip}>
          {w}
          <button type="button" className={s.chipX} aria-label={t("settingsCompany.removeItem", { name: w })} onClick={() => setWords(words.filter((x) => x !== w))}>×</button>
        </span>
      ))}
      <input
        className={s.wordInput}
        value={draft}
        placeholder={t("settingsOrg.addWord")}
        aria-label={t("settingsOrg.keywords")}
        data-testid="settings-routing-keywords"
        onChange={(e) => (e.target.value.endsWith(",") ? commit(e.target.value) : setDraft(e.target.value))}
        onBlur={() => draft && commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft) { e.preventDefault(); commit(draft); }
          if (e.key === "Backspace" && !draft && words.length) setWords(words.slice(0, -1));
        }}
      />
    </div>
  );
}

export function RoutingEditor({ slug, knowledge: k, demo, showHead = true }: Props) {
  const t = useT();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<RuleRow | "new" | null>(null);
  const [owner, setOwner] = useState<string>("");
  const [deleting, setDeleting] = useState<RuleRow | null>(null);
  const [probe, setProbe] = useState("");

  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const role = (id: string | null) => (id ? k.roles.find((x) => x.id === id) ?? null : null);
  const roleLabel = (x: RoleRow) => `${x.title} · ${unitName.get(x.orgUnitId) ?? "?"}`;
  const rules = [...k.rules].sort((a, b) => a.sort - b.sort);
  const sum = routingSummary(k);

  const run = (call: () => Promise<OrgResult>, after?: () => void) =>
    start(async () => {
      const res = await call();
      setError(res.ok ? null : res.error);
      if (res.ok) after?.();
    });

  const openDrawer = (rule: RuleRow | "new") => {
    setError(null);
    setOwner(rule === "new" ? "" : rule.ownerRoleId);
    setOpen(rule);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rule = open === "new" ? null : open;
    const f = new FormData(e.currentTarget);
    const type = text(f, "type");
    const key = rule ? rule.key : routeKeyFor(type, k.rules.map((x) => x.key));
    run(() => saveRouteAction(slug, {
      key, type, keywords: splitWords(text(f, "keywords")), ownerRoleId: orNull(text(f, "owner")),
      deputyRoleId: orNull(text(f, "deputy")), buddyRoleId: orNull(text(f, "buddy")), wait: text(f, "wait"),
    }), () => setOpen(null));
  };

  // The keyword proposal for the test box: the same matcher the intake box uses.
  const proposal = propose(probe, rules.map((x) => ({ ...x, keys: x.keywords })));
  const hit = proposal?.route ?? null;
  const hits = hit ? keywordHits(probe, hit.keys).length : 0;

  const who = (id: string | null, empty: string) => {
    const x = role(id);
    if (!x) return <span className={s.mute}>–{empty ? <><br />{empty}</> : null}</span>;
    const line = seatLine(k, x.id);
    const dept = unitName.get(x.orgUnitId);
    const holder = holdersOfRole(k, x.id).find((h) => h.userId !== null && h.name.trim() !== "");
    return (
      <>
        <span className={r.cellMain}>{x.title}</span>
        {dept ? <span className={r.cellChip}><DeptChip name={dept} /></span> : null}
        {line ? <span className={r.cellSub}>{holder ? <PersonFace name={holder.name} size="sm" /> : null}{line}</span> : <span className={s.vacant}>{t("settingsOrg.vacant")}</span>}
      </>
    );
  };

  const roleOptions = (empty: string) => (
    <>
      <option value="">{empty}</option>
      {k.roles.map((x) => <option key={x.id} value={x.id}>{roleLabel(x)}{seatLine(k, x.id) ? "" : ` · ${t("settingsOrg.vacant")}`}</option>)}
    </>
  );

  const editing = open && open !== "new" ? open : null;
  const ownerRole = role(owner);
  const fieldErr = (key: MessageKey) => (error === key ? t(key) : undefined);
  const otherError = error && !(["settingsOrg.errRouteType", "settingsOrg.errKeywords", "settingsOrg.errRouteNoOwner"] as MessageKey[]).includes(error);
  const addButton = <button type="button" className={s.save} onClick={() => openDrawer("new")} data-testid="settings-routing-open-new">{t("settingsOrg.addRoute")}</button>;

  return (
    <div className={s.page} data-testid="settings-routing">
      {showHead ? (
        <div className={s.headRow}>
          <SettingsHead title={t("settingsOrg.routingTitle")} lede={t("settingsOrg.routeSummary", { routes: String(sum.routes), vacant: String(sum.vacantOwners), noDeputy: String(sum.noDeputy) })} />
          {addButton}
        </div>
      ) : <div className={r.inlineAdd}>{addButton}</div>}
      {demo ? <p className={s.cardHint} data-testid="settings-demo-note">{t("settingsCompany.demoData")}</p> : null}
      {error && !open ? <p className={s.fieldError} role="alert" data-testid="settings-routing-error">{t(error)}</p> : null}

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>{t("settingsOrg.routeTestTitle")}</h2>
          <span className={r.note}>{t("settingsOrg.routeKeywordsOnly")} <span className={r.badge}>{t("settingsOrg.routeProposal")}</span></span>
        </div>
        <input className={s.input} value={probe} onChange={(e) => setProbe(e.target.value)} placeholder={t("settingsOrg.routeTestPlaceholder")}
          aria-label={t("settingsOrg.routeTestTitle")} data-testid="settings-routing-probe" />
        {proposal ? (
          <div className={r.result} data-testid="settings-routing-probe-result">
            {hit ? (
              <>
                <span aria-hidden="true">→</span>
                <div>
                  <div><strong>{hit.type}</strong> <span className={s.mute}>· {t("settingsOrg.routeHits", { n: String(hits), pct: String(proposal.confidence) })}</span></div>
                  <div className={s.mute}>{[role(hit.ownerRoleId)?.title, seatLine(k, hit.ownerRoleId)].filter(Boolean).join(" · ")}</div>
                </div>
              </>
            ) : <span className={s.mute}>{t("settingsOrg.routeTestNone")}</span>}
          </div>
        ) : null}
      </section>

      {rules.length === 0 ? (
        <section className={`${s.card} ${r.empty}`}>
          <h2 className={s.cardTitle}>{t("settingsOrg.routeEmptyTitle")}</h2>
          <p className={s.cardHint}>{t("settingsOrg.routeEmptyText")}</p>
          {k.roles.length ? null : <Link className={s.soft} href={`/${slug}/settings/org`}>{t("settingsOrg.addRolesInOrg")}</Link>}
        </section>
      ) : (
        <section className={`${s.card} ${r.tableCard}`}>
          <div className={r.table} role="table" aria-label={t("settingsOrg.routingTitle")}>
            <div className={`${r.tr} ${r.th}`} role="row">
              <span role="columnheader">{t("settingsOrg.colType")}</span>
              <span role="columnheader">{t("settingsOrg.colOwner")}</span>
              <span role="columnheader">{t("settingsOrg.colDeputy")}</span>
              <span role="columnheader">{t("settingsOrg.colBuddy")}</span>
              <span role="columnheader">{t("settingsOrg.colWait")}</span>
              <span />
            </div>
            {rules.map((rule, i) => (
              <div key={`${rule.id}:${rule.sort}`} className={r.tr} role="row" data-testid={`settings-routing-row-${rule.key}`}>
                <div role="cell" className={r.typeCell}>
                  <button type="button" className={r.typeName} onClick={() => openDrawer(rule)}>{rule.type}</button>
                  <span className={r.kw}>
                    {rule.keywords.slice(0, 3).map((w) => <span key={w}>{w}</span>)}
                    {rule.keywords.length > 3 ? <em>+{rule.keywords.length - 3}</em> : null}
                  </span>
                </div>
                <div role="cell" className={r.cell} data-label={t("settingsOrg.colOwner")}>{who(rule.ownerRoleId, "")}</div>
                <div role="cell" className={r.cell} data-label={t("settingsOrg.colDeputy")}>{who(rule.deputyRoleId, t("settingsOrg.managerChain"))}</div>
                <div role="cell" className={r.cell} data-label={t("settingsOrg.colBuddy")}>{who(rule.buddyRoleId, "")}</div>
                <div role="cell" className={r.wait} data-label={t("settingsOrg.colWait")}>{rule.wait || "–"}</div>
                <details className={s.rowMenu}>
                  <summary aria-label={t("settingsOrg.routeMenu", { name: rule.type })} data-testid={`settings-routing-menu-${rule.key}`}>···</summary>
                  <div className={s.menuList}>
                    <button type="button" onClick={(e) => { closeMenu(e.currentTarget); openDrawer(rule); }}>{t("settingsOrg.edit")}</button>
                    <button type="button" disabled={pending || i === 0} data-testid={`settings-routing-up-${rule.key}`}
                      onClick={(e) => { closeMenu(e.currentTarget); run(() => moveRouteAction(slug, rule.id, "up")); }}>{t("settingsOrg.moveUp")}</button>
                    <button type="button" disabled={pending || i === rules.length - 1} data-testid={`settings-routing-down-${rule.key}`}
                      onClick={(e) => { closeMenu(e.currentTarget); run(() => moveRouteAction(slug, rule.id, "down")); }}>{t("settingsOrg.moveDown")}</button>
                    <button type="button" className={s.danger} data-testid={`settings-routing-remove-${rule.key}`}
                      onClick={(e) => { closeMenu(e.currentTarget); setDeleting(rule); }}>{t("settingsOrg.delete")}</button>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}
      {rules.length ? <p className={r.foot}>{t("settingsOrg.routeFoot")}</p> : null}

      {deleting ? (
        <div className={s.scrim} onClick={() => setDeleting(null)}>
          <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="route-delete-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="route-delete-title" className={s.cardTitle}>{t("settingsOrg.deleteAsk", { name: deleting.type })}</h2>
            <p className={s.dialogText}>{t("settingsOrg.deleteText")}</p>
            <div className={s.dialogButtons}>
              <button type="button" className={s.soft} onClick={() => setDeleting(null)}>{t("settingsOrg.cancel")}</button>
              <button type="button" className={s.dangerBtn} disabled={pending || demo} data-testid="settings-routing-delete-yes"
                onClick={() => run(() => removeRouteAction(slug, deleting.id), () => { setDeleting(null); setOpen(null); })}>{t("settingsOrg.deleteRoute")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className={s.scrim} onClick={() => setOpen(null)}>
          <form key={editing?.id ?? "new"} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="route-drawer-title"
            onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid={editing ? `settings-routing-drawer-${editing.key}` : "settings-routing-new"}>
            <div className={s.drawerHead}>
              <h2 id="route-drawer-title" className={s.drawerTitle}>{editing ? editing.type : t("settingsOrg.newRoute")}</h2>
              <button type="button" className={s.close} aria-label={t("settingsOrg.close")} onClick={() => setOpen(null)}>×</button>
            </div>
            <div className={s.drawerBody}>
              <label className={s.field}>
                <span className={s.label}>{t("settingsOrg.routeType")}</span>
                <input className={s.input} name="type" defaultValue={editing?.type ?? ""} required maxLength={120} autoFocus
                  aria-invalid={Boolean(fieldErr("settingsOrg.errRouteType")) || undefined} data-testid="settings-routing-type" />
                {fieldErr("settingsOrg.errRouteType") ? <span className={s.fieldError}>{fieldErr("settingsOrg.errRouteType")}</span> : null}
              </label>
              <div className={s.field}>
                <span className={s.label}>{t("settingsOrg.keywords")}</span>
                <KeywordInput initial={editing?.keywords ?? []} invalid={Boolean(fieldErr("settingsOrg.errKeywords"))} />
                {fieldErr("settingsOrg.errKeywords") ? <span className={s.fieldError}>{fieldErr("settingsOrg.errKeywords")}</span> : null}
                <span className={s.help}>{t("settingsOrg.keywordsHelp")}</span>
              </div>
              <label className={s.field}>
                <span className={s.label}>{t("settingsOrg.routeOwner")}</span>
                <select className={s.input} name="owner" value={owner} onChange={(e) => setOwner(e.target.value)}
                  aria-invalid={Boolean(fieldErr("settingsOrg.errRouteNoOwner")) || undefined} data-testid="settings-routing-owner">
                  {roleOptions(t("settingsOrg.pickRole"))}
                </select>
                {fieldErr("settingsOrg.errRouteNoOwner") ? <span className={s.fieldError}>{fieldErr("settingsOrg.errRouteNoOwner")}</span> : null}
              </label>
              {ownerRole && !seatLine(k, ownerRole.id) ? (
                <div className={s.warn} role="note">
                  {t("settingsOrg.vacantWarn", { role: ownerRole.title })}
                  <Link href={`/${slug}/settings/org`}>{t("settingsOrg.linkInOrg")}</Link>
                </div>
              ) : null}
              <label className={s.field}>
                <span className={s.label}>{t("settingsOrg.routeDeputy")}</span>
                <select className={s.input} name="deputy" defaultValue={editing?.deputyRoleId ?? ""} data-testid="settings-routing-deputy">{roleOptions(t("settingsOrg.routeNone"))}</select>
                <span className={s.help}>{t("settingsOrg.deputyHelp")}</span>
              </label>
              <label className={s.field}>
                <span className={s.label}>{t("settingsOrg.routeBuddy")}</span>
                <select className={s.input} name="buddy" defaultValue={editing?.buddyRoleId ?? ""} data-testid="settings-routing-buddy">{roleOptions(t("settingsOrg.routeNone"))}</select>
                <span className={s.help}>{t("settingsOrg.buddyHelp")}</span>
              </label>
              <label className={s.field}>
                <span className={s.label}>{t("settingsOrg.routeWait")}</span>
                <input className={s.input} data-size="money" name="wait" defaultValue={editing?.wait ?? ""} data-testid="settings-routing-wait" />
                <span className={s.help}>{t("settingsOrg.waitHelp")}</span>
              </label>
              {otherError && error ? <p className={s.fieldError} role="alert" data-testid="settings-routing-error">{t(error)}</p> : null}
            </div>
            <div className={s.drawerFoot}>
              {editing ? <span className={s.mute}>{t("settingsOrg.keyLine", { key: editing.key })}</span> : <span />}
              <span className={s.dialogButtons}>
                {editing ? <button type="button" className={s.ghostDanger} onClick={() => setDeleting(editing)}>{t("settingsOrg.deleteRoute")}</button> : null}
                <button type="button" className={s.soft} onClick={() => setOpen(null)}>{t("settingsOrg.cancel")}</button>
                <button type="submit" className={s.save} disabled={pending || demo} data-testid={editing ? `settings-routing-save-${editing.key}` : "settings-routing-add"}>{t("settingsOrg.save")}</button>
              </span>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
