"use client";
// "Set up project" (Paper, Set up row): the pages a draft starts with and who is asked to join it, in one window. Nothing is sent
// before Save; every change is then one event the draft page could send too, asked of the server's rules first. The goal,
// the baseline and the start stay with the draft's own steps: without them the project stays a draft (Kevin, 25 Nov 2026).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { addablePages, canAddTool, hasDefaultTitle, LIMITS, pagesOf, TOOL_KINDS } from "@/features/projects/pages";
import { isHandle } from "@/features/projects/views";
import { toolIcon } from "@/features/projects/page-wizard";
import { hasClosedAudience } from "@/features/cases/visibility";
import type { InviteRole, ProjectPage, ReducedProject, ToolKind } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { Glyph } from "../page/AddPageDialog";
import { usePageActs } from "../page/usePageActs";
import { peopleOf, useRights, useSend } from "../parts";
import styles from "./SetupDialog.module.css";

/** Who the window asks: the sponsor is asked on the draft's Team step. */
const ROLES: readonly InviteRole[] = ["colead", "member", "follower"];
/** The pages it proposes; the rest are one click away. */
const PROPOSED = new Set(["steps", "plan", "results"]);

type Page = Pick<ProjectPage, "title" | "icon"> & { key: string; pageId?: string; kinds: ToolKind[] };
type Guest = { userId: string; name: string; role: InviteRole };

const toolKey = (kind: ToolKind) => `projectPages.tool${kind[0].toUpperCase()}${kind.slice(1)}` as MessageKey;

/** On the body, so the app's top bar never covers its head. */
export function SetupDialog({ p, onClose }: { p: ReducedProject; onClose: () => void }) {
  return createPortal(<Dialog p={p} onClose={onClose} />, document.body);
}

function Dialog({ p, onClose }: { p: ReducedProject; onClose: () => void }) {
  const { act, flag, seed, showToast, S } = useDemo();
  const t = useT();
  const { check } = useRights(p);
  const send = useSend(p);
  const acts = usePageActs(p);
  const agent = flag("agent");
  const there = pagesOf(p, { agent });
  const gone = [...p.removed.map((x) => x.page?.id), ...Object.values(p.merges).map((m) => m.from.id)].filter((id): id is string => !!id);
  const ready: Page[] = addablePages(there, gone, { agent }).map((x) => ({ key: x.id, pageId: x.id, title: x.title, icon: x.icon, kinds: x.tools.map((tool) => tool.kind) }));
  const mayPages = check("project.page.added", { pageId: "probe", title: "-", icon: "doc", tools: [] }).ok;
  const mayInvite = check("project.invited", { userId: "-", role: "member" }).ok;
  // The proposal is made once, for a draft that has no page of its own yet.
  const [pages, setPages] = useState<Page[]>(() => (there.length <= 3 && mayPages ? ready.filter((x) => PROPOSED.has(x.key)) : []));
  const [guests, setGuests] = useState<Guest[]>([]);
  const [touched, setTouched] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [naming, setNaming] = useState<{ title: string; kinds: ToolKind[] } | null>(null);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const n = useRef(0);

  const close = () => { if (busy) return; if (touched && !leaving) setLeaving(true); else onClose(); };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab" || !panel.current) return;
      const all = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
      const first = all[0], last = all.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (before instanceof HTMLElement) before.focus(); };
  }, []);

  const change = (go: () => void) => { setTouched(true); setLeaving(false); setError(null); go(); };
  const titleOf = (x: Pick<ProjectPage, "id" | "title">) => (hasDefaultTitle(x) ? t(x.title as MessageKey) : x.title);
  const nameOf = (x: Page) => titleOf({ id: x.pageId ?? "", title: x.title });
  const free = ready.filter((x) => !pages.some((y) => y.key === x.key));
  // What a new page may hold, with the pages already picked counted in (a single tool stands on one page only).
  const asPage = (x: Page): ProjectPage => ({ id: x.key, title: x.title, icon: x.icon, tools: x.kinds.map((kind) => ({ id: x.key + kind, kind, title: null, collapsed: false, content: null, rev: 0 })) });
  const all = [...there, ...pages.map(asPage)];
  const empty: ProjectPage = { id: "new", title: "", icon: "doc", tools: [] };
  const tools = TOOL_KINDS.filter((kind) => kind !== "agent" && canAddTool(all, empty, kind, { agent }));

  // Asking someone on a private or custom idea lets them read it (Q5.14), as the draft's Team step says.
  const closed = S.cases.some((c) => p.sources.includes(c.id) && hasClosedAudience(c));
  const people = peopleOf(seed.seats);
  const taken = new Set([p.leadUserId, ...p.memberUserIds, ...p.followerUserIds, ...p.invites.filter((i) => i.state === "pending" || i.state === "accepted").map((i) => i.userId), ...guests.map((g) => g.userId)]);
  const q = find.trim().toLowerCase();
  const hits = q ? people.filter((x) => !taken.has(x.userId) && x.name.toLowerCase().includes(q)).slice(0, 5) : [];

  // Who raised the idea or commented on it under their own name; a handle names nobody, so it suggests nobody.
  const spoke = new Map<string, "setupRaised" | "setupCommented">();
  for (const c of S.cases.filter((x) => p.sources.includes(x.id))) {
    for (const e of c.history) {
      const why = e.type === "case.raised" ? "setupRaised" : e.type === "case.commented" ? "setupCommented" : null;
      if (why && e.actorUserId && !isHandle(e.actor) && !(isHandle(c.from) && e.actorUserId === c.fromUserId) && !spoke.has(e.actorUserId)) spoke.set(e.actorUserId, why);
    }
  }
  const suggested = q ? [] : people.filter((x) => spoke.has(x.userId) && !taken.has(x.userId)).slice(0, 5);
  const ask = (x: { userId: string; name: string }) => change(() => { setGuests([...guests, { ...x, role: "member" }]); setFind(""); });

  const addOwn = () => {
    if (!naming) return;
    const title = naming.title.trim();
    if (!title || !naming.kinds.length) return;
    const key = "own" + n.current++;
    change(() => { setPages([...pages, { key, title, icon: toolIcon[naming.kinds[0]], kinds: naming.kinds }]); setNaming(null); });
  };

  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      // What went through leaves the list, so a retry after a refusal does not send it twice.
      for (const x of pages) {
        const out = await acts.create({ ...(x.pageId ? { pageId: x.pageId } : {}), title: x.title, icon: x.icon, tools: x.kinds.map((kind) => ({ kind })) });
        if (!out.ok) { setError(out.error); return; }
        setPages((l) => l.filter((y) => y.key !== x.key));
      }
      for (const g of guests) {
        if (!send("project.invited", { userId: g.userId, role: g.role }, () => act.project.invite(p.id, g.userId, g.role))) return;
        setGuests((l) => l.filter((y) => y.userId !== g.userId));
      }
      showToast(t("projectDraft.setupSaved"));
      onClose();
    } catch { setError(t("projectPages.notSaved")); }
    finally { setBusy(false); }
  };

  return (
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="setup-title" aria-busy={busy} tabIndex={-1}>
        <header className={styles.head}>
          <span className={styles.headText}>
            <h2 id="setup-title" className={styles.title}>{t("projectDraft.setupTitle")}</h2>
            <span className={styles.sub}>{p.title}</span>
          </span>
          <button type="button" className={styles.x} aria-label={t("common.close")} onClick={close}>×</button>
        </header>

        <div className={styles.body}>
          {mayPages && (
            <section className={styles.section} aria-labelledby="setup-pages">
              <h3 id="setup-pages" className={styles.h3}>{t("projectDraft.setupPages")}</h3>
              <ul className={styles.chips} aria-label={t("projectDraft.setupThere")}>
                {there.map((x) => <li key={x.id} className={styles.chip}><Glyph icon={x.icon} />{titleOf(x)}</li>)}
              </ul>
              {pages.length > 0 && (
                <ul className={styles.rows}>
                  {pages.map((x) => (
                    <li key={x.key} className={styles.row} data-testid="setup-page">
                      <Glyph icon={x.icon} />
                      <span className={styles.name}>{nameOf(x)}</span>
                      <span className={styles.tools}>{x.kinds.map((kind) => <span key={kind} className={styles.tool}>{t(toolKey(kind))}</span>)}</span>
                      <button type="button" className={styles.x} aria-label={t("projectDraft.setupRemove", { name: nameOf(x) })} onClick={() => change(() => setPages(pages.filter((y) => y.key !== x.key)))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              {naming ? (
                <div className={styles.own} role="group" aria-label={t("projectDraft.setupAddPage")}>
                  <input className="nh-input" value={naming.title} maxLength={LIMITS.titleMax} autoFocus placeholder={t("projectDraft.setupPageName")} aria-label={t("projectDraft.setupPageName")} onChange={(e) => setNaming({ ...naming, title: e.target.value })} />
                  <span className={styles.chips}>
                    {tools.map((kind) => {
                      const on = naming.kinds.includes(kind);
                      return <button key={kind} type="button" className={styles.pick} aria-pressed={on} onClick={() => setNaming({ ...naming, kinds: on ? naming.kinds.filter((k) => k !== kind) : [...naming.kinds, kind] })}>{t(toolKey(kind))}</button>;
                    })}
                  </span>
                  <span className={styles.actions}>
                    <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!naming.title.trim() || !naming.kinds.length} onClick={addOwn}>{t("projects.add")}</button>
                    <button type="button" className={styles.quiet} onClick={() => setNaming(null)}>{t("common.cancel")}</button>
                  </span>
                </div>
              ) : there.length + pages.length < LIMITS.pages && (
                <span className={styles.chips}>
                  {free.map((x) => <button key={x.key} type="button" className={styles.pick} onClick={() => change(() => setPages([...pages, x]))}>+ {nameOf(x)}</button>)}
                  <button type="button" className={styles.pick} onClick={() => setNaming({ title: "", kinds: [] })}>+ {t("projectDraft.setupAddPage")}</button>
                </span>
              )}
            </section>
          )}

          {mayInvite && (
            <section className={styles.section} aria-labelledby="setup-people">
              <h3 id="setup-people" className={styles.h3}>{t("projectDraft.setupPeople")}</h3>
              <input className="nh-input" value={find} placeholder={t("projectDraft.setupFind")} aria-label={t("projectDraft.setupFind")} onChange={(e) => setFind(e.target.value)} />
              {hits.length > 0 && (
                <ul className={styles.rows} aria-label={t("projectDraft.setupFind")}>
                  {hits.map((x) => (
                    <li key={x.userId}><button type="button" className={styles.hit} onClick={() => ask(x)}><PersonFace name={x.name} size="sm" />{x.name}</button></li>
                  ))}
                </ul>
              )}
              {suggested.length > 0 && (
                <ul className={styles.chips} aria-label={t("projectDraft.setupSuggested")}>
                  {suggested.map((x) => <li key={x.userId}><button type="button" className={styles.pick} onClick={() => ask(x)}>+ {x.name} · {t(spoke.get(x.userId) === "setupRaised" ? "projectDraft.setupRaised" : "projectDraft.setupCommented")}</button></li>)}
                </ul>
              )}
              {q !== "" && hits.length === 0 && <p className={styles.sub}>{t("projectDraft.setupNobody")}</p>}
              <ul className={styles.rows}>
                <li className={styles.row}><PersonFace name={p.lead} size="sm" /><span className={styles.name}>{p.lead}</span><span className={styles.sub}>{t("projects.leadTag")}</span></li>
                {guests.map((g) => (
                  <li key={g.userId} className={styles.row} data-testid="setup-guest">
                    <PersonFace name={g.name} size="sm" />
                    <span className={styles.name}>{g.name}</span>
                    <select className={`nh-input nh-select ${styles.role}`} value={g.role} aria-label={t("projectDraft.setupRoleOf", { name: g.name })} onChange={(e) => change(() => setGuests(guests.map((y) => (y.userId === g.userId ? { ...y, role: e.target.value as InviteRole } : y))))}>
                      {ROLES.filter((x) => x !== "colead" || check("project.invited", { userId: g.userId, role: x }).ok).map((x) => <option key={x} value={x}>{t(("projectDraft.role_" + x) as "projectDraft.role_member")}</option>)}
                    </select>
                    <button type="button" className={styles.x} aria-label={t("projectDraft.setupRemove", { name: g.name })} onClick={() => change(() => setGuests(guests.filter((y) => y.userId !== g.userId)))}>×</button>
                  </li>
                ))}
              </ul>
              {closed && <p className={styles.warn} role="note">{t("projectDraft.teamWarn")}</p>}
            </section>
          )}
        </div>

        <footer className={styles.foot}>
          {error && <span className="nh-error" role="alert">{error}</span>}
          {leaving ? (
            <>
              <span className={styles.ask}>{t("projectDraft.setupLeave")}</span>
              <button type="button" className="nh-btn nh-btn-ghost" onClick={onClose}>{t("projectDraft.setupDiscard")}</button>
              <button type="button" className="nh-btn nh-btn-primary" onClick={() => setLeaving(false)}>{t("projectDraft.setupKeep")}</button>
            </>
          ) : (
            <>
              <button type="button" className="nh-btn nh-btn-ghost" disabled={busy} onClick={close}>{t("common.cancel")}</button>
              <button type="button" className="nh-btn nh-btn-primary" disabled={busy || (!pages.length && !guests.length)} onClick={save}>{t(busy ? "projectDraft.setupSaving" : "projectDraft.setupSave")}</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
