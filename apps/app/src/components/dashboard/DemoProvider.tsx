"use client";
// The one place the dashboard's client state lives. Port of the state half of the legacy
// Component class (legacy/demo/js/dashboard.js): the event log, the persona being viewed,
// demo data on/off, the department scope, search, popovers, the input sheet and the toast.
//
// Rule carried over: UI code changes domain state only through `act.*`, which appends one
// event as the current persona. Everything shown is reduce(seed, log) - see features/cases.
// Two modes, one context:
//   server mode (a `viewer` prop, i.e. a real session) - the log comes from Postgres, every
//     act.* appends through a server action, and everyone looking at the company sees it.
//   local mode (no viewer) - the original localStorage demo, kept because `npm run dev`, the CI
//     build and the no-database path all have to keep working.
// The dev-panel settings (demo on/off, department) stay in localStorage either way: they are
// per-viewer preferences, not facts.
//
// Two constraints shaped this file, both load-bearing:
//   * act.raise/cosign/affect are consumed SYNCHRONOUSLY for their return values
//     (RaiseView passes the new id straight to saveShots). So emit() pushes onto a pending queue
//     synchronously and only then fires the server action.
//   * `ready` must stay false on the server and flip after hydration, or ten views that gate on
//     it start rendering dates during SSR and every page hydration-mismatches at once.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccess, ROLE_HOME, type Role } from "@/config/roles";
import { appendEvent, emptyLog, newId, type CaseEvent, type EventLog, type EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import { reduce, type State } from "@/features/cases/reducer";
import { dayFormatter, type DayFmt } from "@/features/cases/rows";
import { affectedOn, exportSnippet } from "@/features/cases/selectors";
import type { Persona, RolePersona, Seed } from "@/features/demo/types";
import { counts, demoData, type Counts, type DemoData } from "@/features/metrics";
import { clearPrefs, getServerSnapshot, getSnapshot, resetLog, setPrefs, subscribe, updateLog } from "@/lib/demo-log";
import { clearShots, dropShots } from "@/lib/shots";
import { deptName as deptNameOf } from "@/lib/utils/format";
import { appendEventAction, deleteAddedAction, resetCompanyAction, switchUserAction } from "@/server/actions/events";
import { signOut } from "@/server/actions/auth";

export type Pop = "search" | "decisions" | "me" | "sort" | "filter";
export type SheetKind = "no" | "ask" | "reply" | "hand" | "assign" | "askIdea";
export type Sheet = { kind: SheetKind; id: string; text: string; picked: string | null; people: string[] };

export type Act = {
  raise: (p: EventPayload) => string;
  read: (id: string) => void;
  decide: (id: string, answer: "yes" | "no", reason?: string, note?: string) => void;
  hand: (id: string, to: string, why?: string) => void;
  ask: (id: string, text: string) => void;
  answer: (id: string, text: string) => void;
  override: (id: string, proposed: string | null, chosen: string) => void;
  cosign: (ideaId: string) => boolean; // true when the co-sign was added, false when withdrawn
  affect: (caseId: string, why?: string) => boolean; // "this affects me too" (+ why, from a lead) - true when added, false when withdrawn
  comment: (caseId: string, text: string) => void;
  rescore: (caseId: string, text: string) => void; // new information: the score is re-evaluated with it
  askIdea: (ideaId: string, text: string) => void;
  approve: (ideaId: string, team: string[], note: string) => void;
  fund: (ideaId: string, team: string[], note: string) => void;
  advanceDay: (by?: number) => void;
};

export type DemoContext = {
  tenant: TenantInfo;
  seed: Seed;
  ready: boolean;
  serverMode: boolean; // a session and Postgres behind the page; false = the localStorage demo
  S: State; D: DemoData; N: Counts; log: EventLog;
  role: Role; setRole: (r: Role) => void;
  leadAs: string | null; setLeadAs: (name: string) => void;
  persona: { role: RolePersona; who: Persona }; actor: string; email: string | null;
  demo: boolean; toggleDemo: () => void;
  dept: string; setDept: (id: string) => void; matches: (depts: readonly string[]) => boolean; deptName: (id: string) => string;
  q: string; setQ: (q: string) => void;
  pop: Pop | null; setPop: (p: Pop | null) => void; togglePop: (p: Pop) => void;
  sheet: Sheet | null; openSheet: (kind: SheetKind, id: string, init?: Partial<Sheet>) => void; closeSheet: () => void; patchSheet: (p: Partial<Sheet>) => void;
  toast: string | null; showToast: (msg: string) => void;
  menu: boolean; setMenu: (b: boolean) => void;
  dev: boolean; setDev: (b: boolean) => void;
  act: Act;
  resetDemo: () => void; deleteAdded: () => void; copySnippet: () => void; logout: () => void;
  f: DayFmt; // demo day offset -> "today" / "12 Sep"
  href: (path: string) => string; // "/ideas?id=i1" -> "/acme/ideas?id=i1"
};

const Ctx = createContext<DemoContext | null>(null);

export function useDemo(): DemoContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo() outside <DemoProvider>");
  return c;
}

// First visit: the URL says which role the visitor meant (/manager or /settings -> manager, /leader -> leader).
// Everything else - the front door /[company] included - starts as the employee: the login sends
// people in there, and the employee's Raise page is where every case begins.
function roleFromPath(path: string): Role {
  if (path === "/manager" || path.startsWith("/manager/") || path === "/settings" || path.startsWith("/settings/")) return "manager";
  if (path === "/leader" || path.startsWith("/leader/")) return "leader";
  return "member";
}

const iniOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);

// What the shell knows about the company: slug + name for chrome, and the people - used for the
// email in the profile menu, and (in server mode) to switch person from the dev panel.
export type TenantInfo = {
  slug: string;
  name: string;
  users?: { id?: string; name: string; email: string; role?: Role }[];
  /** False for a company with real people: no dev panel, and `users` is only the viewer. */
  demoTools?: boolean;
};

/** The signed-in person. Present only in server mode. */
export type ViewerInfo = { userId: string; name: string; handle: string | null; role: Role; line?: string };

type Props = {
  tenant: TenantInfo;
  seed: Seed;
  /** Server mode: the company's log out of Postgres. */
  initialLog?: EventLog;
  /** Server mode: who is signed in. Absent means the localStorage demo. */
  viewer?: ViewerInfo | null;
  children: React.ReactNode;
};

export function DemoProvider({ tenant, seed, initialLog, viewer, children }: Props) {
  const serverMode = Boolean(viewer);
  const router = useRouter();
  const router_refresh = router.refresh;
  const pathname = usePathname();
  const slug = tenant.slug;
  const appPath = pathname.startsWith("/" + slug) ? pathname.slice(slug.length + 1) || "/" : pathname;

  // What this browser remembers: the dev-panel settings, and (local mode only) the event log.
  const persisted = useSyncExternalStore(subscribe, () => getSnapshot(slug), getServerSnapshot);

  // Client-only, in BOTH modes: false during SSR, true once this browser has hydrated. Ten views
  // gate their date rendering on it, so making it true on the server would hydration-mismatch
  // every page at once. The external store already has exactly this shape, so no effect is needed.
  const ready = persisted.loaded;

  // Server mode: events this browser just appended, held until the server echoes them back.
  // Appended synchronously so act.raise() can still return the new id to its caller.
  const [pending, setPending] = useState<CaseEvent[]>([]);
  const [, startTransition] = useTransition();

  // Drop optimistic events once the server's copy contains them. Adjusted during render rather
  // than in an effect - React supports this for "derive state from a changed prop", and it avoids
  // the extra commit an effect would cost.
  const [seenLog, setSeenLog] = useState(initialLog);
  if (serverMode && initialLog !== seenLog) {
    setSeenLog(initialLog);
    const have = new Set((initialLog?.events ?? []).map((e) => e.id));
    setPending((p) => (p.some((e) => have.has(e.id)) ? p.filter((e) => !have.has(e.id)) : p));
  }

  const log = useMemo<EventLog>(() => {
    if (!serverMode) return persisted.log;
    const base = initialLog ?? emptyLog();
    const have = new Set(base.events.map((e) => e.id));
    const extra = pending.filter((e) => !have.has(e.id));
    if (extra.length === 0) return base;
    const dayDelta = extra.reduce((n, e) => (e.type === "day.advanced" ? n + (e.payload.by ?? 1) : n), 0);
    return { events: base.events.concat(extra), day: base.day + dayDelta };
  }, [serverMode, persisted.log, initialLog, pending]);

  // The guess is made once per page load, so following a link (/raise -> /cases/x) keeps the persona.
  const [guessedRole] = useState(() => roleFromPath(appPath));
  // Server mode: the role is the session's, not a client preference - that is the whole point of
  // enforcing it in proxy.ts.
  const role: Role = viewer ? viewer.role : (persisted.prefs.role ?? guessedRole);
  const leadAs = serverMode ? null : (persisted.prefs.leadAs ?? null);
  const demo = persisted.prefs.demo ?? true;
  const dept = persisted.prefs.dept ?? "PRD";

  const [q, setQ] = useState("");
  const [pop, setPop] = useState<Pop | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dev, setDev] = useState(false);
  const [today] = useState(() => new Date()); // views render dates only once `ready`, so server/client never disagree on screen
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by logout: the persona is being forgotten and the login page is next, so the access
  // check below must not send a manager on /manager "home" as whatever role the URL guessed.
  const leaving = useRef(false);

  // Roles are data: a role that may not open this path is sent home.
  useEffect(() => {
    if (ready && !leaving.current && !canAccess(role, appPath)) router.replace("/" + slug + ROLE_HOME[role]);
  }, [ready, role, appPath, router, slug]);

  // Server mode: pick up what other people did. Without this, two testers each see only their
  // own writes until they reload by hand - which is the whole thing this change exists to fix.
  // Paused while the tab is hidden so a forgotten tab does not poll all afternoon.
  useEffect(() => {
    if (!serverMode) return;
    const tick = () => { if (document.visibilityState === "visible") router_refresh(); };
    const timer = setInterval(tick, 8000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [serverMode, router_refresh]);

  // ⌘K / Ctrl+K focuses the search box; Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("nh-search")?.focus();
        setPop("search");
      } else if (e.key === "Escape") {
        const el = document.getElementById("nh-search");
        if (el && e.target === el) return; // the box clears its text first, closes on the second press
        el?.blur();
        setPop(null); setQ(""); setMenu(false); setSheet(null); setDev(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const S = useMemo(() => reduce(seed, log), [seed, log]);
  const D = useMemo(() => demoData(seed, S, demo), [seed, S, demo]);
  const N = useMemo(() => counts(seed, D), [seed, D]);

  const deptName = useCallback((id: string) => deptNameOf(seed.depts, id), [seed.depts]);

  // The effective role + person. The team-leader role can be viewed as any desk holder (dev
  // panel -> "inbox of"), so a hand-over or an escalation can be followed into the other inbox.
  const persona = useMemo(() => {
    const rp = seed.personas.find((r) => r.id === role) ?? seed.personas[seed.personas.length - 1];
    // Server mode: the person is whoever is signed in, not a seed persona. Their name has to
    // match a name used in the company's seed, or derive.ts matches nothing - the admin
    // create-company action warns about that.
    if (viewer) {
      return {
        role: rp,
        who: { name: viewer.name, ini: iniOf(viewer.name), line: viewer.line || rp.who.line, handle: viewer.handle },
      };
    }
    if (rp.id !== "leader" || !leadAs || leadAs === rp.who.name) return { role: rp, who: rp.who };
    const r = seed.routes.find((x) => x.owner.name === leadAs);
    const b = seed.buddies.find((x) => x.name === leadAs);
    const bDept = b ? seed.depts.find((d) => d.name === b.dept)?.id : undefined;
    const pDept = r ? r.owner.dept : bDept ?? rp.dept;
    const line = r ? r.owner.role + " · " + deptName(r.owner.dept) : b ? "Team lead · " + b.dept : "Deputy · " + deptName(pDept);
    return { role: { ...rp, dept: pDept }, who: { name: leadAs, ini: iniOf(leadAs), line, handle: null } };
  }, [seed, role, leadAs, deptName, viewer]);

  // Who is acting: the employee posts under their handle, everyone else by name.
  const actor = persona.role.id === "member" && persona.who.handle ? persona.who.handle : persona.who.name;
  const email = tenant.users?.find((u) => u.name === persona.who.name)?.email ?? null;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  // One append. Local mode writes straight to localStorage; server mode renders the event
  // optimistically (synchronously, so act.raise can return its id) and then persists it.
  const emit = useCallback((type: AppEventType, target: string | null, payload?: EventPayload, id?: string) => {
    if (!serverMode) {
      updateLog(slug, (prev) => appendEvent(prev, { type, actor, target, payload }));
      return;
    }
    const ev: CaseEvent = {
      id: id ?? newId("e"),
      ts: Date.now(),
      day: log.day,
      type,
      actor,
      target,
      payload: payload ?? {},
    };
    setPending((p) => p.concat([ev]));
    startTransition(async () => {
      const res = await appendEventAction({ slug, id: ev.id, type, target, payload: ev.payload });
      if (!res.ok) {
        setPending((p) => p.filter((x) => x.id !== ev.id));
        showToast(res.error);
      }
      router_refresh();
    });
  }, [serverMode, slug, actor, log.day, router_refresh, showToast]);

  const act = useMemo<Act>(() => ({
    // Stays synchronous and still returns the id: RaiseView hands it straight to saveShots().
    raise: (p) => { const id = newId("c"); emit("case.raised", id, p); return id; },
    read: (id) => emit("case.read", id),
    decide: (id, answer, reason, note) => emit("case.decided", id, { answer, reason, note }),
    hand: (id, to, why) => emit("case.handed", id, { to, why }),
    ask: (id, text) => emit("case.asked", id, { text }),
    answer: (id, text) => emit("case.answered", id, { text }),
    override: (id, proposed, chosen) => emit("case.override", id, { proposed, chosen }),
    cosign: (ideaId) => {
      const already = S.ideas.find((x) => x.id === ideaId)?.cosigners.some((x) => x.name === actor) ?? false;
      emit(already ? "idea.uncosigned" : "idea.cosigned", ideaId);
      return !already;
    },
    affect: (caseId, why) => {
      // Decided against the log as it is at that moment, so a double click toggles cleanly.
      if (serverMode) {
        const added = !affectedOn(log, caseId).some((a) => a.name === actor);
        emit(added ? "case.affected" : "case.unaffected", caseId, added && why ? { why } : undefined);
        return added;
      }
      let added = true;
      updateLog(slug, (prev) => {
        added = !affectedOn(prev, caseId).some((a) => a.name === actor);
        return appendEvent(prev, { type: added ? "case.affected" : "case.unaffected", actor, target: caseId, payload: added && why ? { why } : undefined });
      });
      return added;
    },
    comment: (caseId, text) => emit("case.commented", caseId, { text }),
    rescore: (caseId, text) => emit("case.commented", caseId, { text, rescore: true }),
    askIdea: (ideaId, text) => emit("idea.asked", ideaId, { text }),
    approve: (ideaId, team, note) => emit("idea.approved", ideaId, { team, note }),
    fund: (ideaId, team, note) => emit("idea.funded", ideaId, { team, note }),
    advanceDay: (by) => emit("day.advanced", null, { by: by ?? 1 }),
  }), [emit, S.ideas, actor, slug, serverMode, log]);

  const href = useCallback((path: string) => "/" + slug + path, [slug]);
  // Close the popovers and the mobile menu; the dev panel stays open so settings can be changed in a row.
  const closeAll = useCallback(() => { setPop(null); setQ(""); setMenu(false); }, []);

  const setRole = useCallback((r: Role) => {
    const rp = seed.personas.find((x) => x.id === r);
    // Server mode: the role comes from the session, so "viewing as" has to actually become
    // somebody else. Only allowed while the company is in demo stage - the action checks.
    if (serverMode) {
      const target = tenant.users?.find((u) => u.role === r && u.id);
      if (!target?.id) { showToast("No " + r + " in this company to switch to."); return; }
      closeAll();
      startTransition(async () => {
        const res = await switchUserAction(slug, target.id!);
        if (!res.ok) { showToast(res.error); return; }
        router.push(href(ROLE_HOME[r]));
        router_refresh();
      });
      return;
    }
    setPrefs(slug, { role: r, leadAs: null, dept: rp?.dept ?? dept });
    closeAll();
    router.push(href(ROLE_HOME[r]));
  }, [seed.personas, slug, dept, closeAll, router, href, serverMode, tenant.users, showToast, router_refresh]);

  // Dev panel: look at the team-leader screens as another desk holder.
  const setLeadAs = useCallback((name: string) => {
    if (serverMode) {
      const target = tenant.users?.find((u) => u.name === name && u.id);
      if (!target?.id) { showToast(name + " is seed data, not a person who can sign in here."); return; }
      closeAll();
      startTransition(async () => {
        const res = await switchUserAction(slug, target.id!);
        if (!res.ok) { showToast(res.error); return; }
        router.push(href(ROLE_HOME.leader));
        router_refresh();
      });
      return;
    }
    const lead = seed.personas.find((r) => r.id === "leader");
    const r = seed.routes.find((x) => x.owner.name === name);
    const b = seed.buddies.find((x) => x.name === name);
    const nextDept = r ? r.owner.dept : b ? (seed.depts.find((d) => d.name === b.dept)?.id ?? lead?.dept ?? "PRD") : lead?.dept ?? "PRD";
    setPrefs(slug, { role: "leader", leadAs: lead && name === lead.who.name ? null : name, dept: nextDept });
    closeAll();
    router.push(href(ROLE_HOME.leader));
  }, [seed, slug, closeAll, router, href, serverMode, tenant.users, showToast, router_refresh]);

  const resetDemo = useCallback(() => {
    clearShots(slug);
    setQ(""); setPop(null); setSheet(null);
    if (serverMode) {
      // Shared: this resets the company for everyone looking at it, not just this browser.
      startTransition(async () => {
        const res = await resetCompanyAction(slug);
        showToast(res.ok ? "Demo reset for everyone in this company." : res.error);
        router_refresh();
      });
      return;
    }
    resetLog(slug);
    setPrefs(slug, { leadAs: null });
    showToast("Demo state reset");
  }, [slug, showToast, serverMode, router_refresh]);

  // Dev panel: drop the cases raised in this browser (and everything done to them); seed cases and
  // what was done to them stay. A log purge, not an event - it only exists for the demo.
  const deleteAdded = useCallback(() => {
    const ids = new Set(S.cases.filter((c) => !c.seed).map((c) => c.id));
    if (!ids.size) { showToast("Nothing to delete — every case here is seed data."); return; }
    const said = "Deleted " + ids.size + (ids.size === 1 ? " case" : " cases") + " you added. Seed data untouched.";
    dropShots(slug, ids);
    setSheet(null);
    if (serverMode) {
      startTransition(async () => {
        const res = await deleteAddedAction(slug, [...ids]);
        showToast(res.ok ? said : res.error);
        router_refresh();
      });
      return;
    }
    updateLog(slug, (prev) => ({ ...prev, events: prev.events.filter((e) => !(e.target && ids.has(e.target))) }));
    showToast(said);
  }, [S, slug, showToast, serverMode, router_refresh]);

  // Log out: forget the persona in this browser and go back to the company login. Demo log stays.
  // `leaving` first: clearing the prefs drops the role to the page-load guess, and without the
  // flag the access effect would bounce a manager or team leader back to that role's home
  // instead of the login page (the employee never noticed - /raise is open to every role).
  const logout = useCallback(() => {
    leaving.current = true;
    clearPrefs(slug);
    closeAll(); setSheet(null);
    if (serverMode) {
      // Clears the cookie server-side and redirects; a client-side push would leave the session.
      startTransition(async () => { await signOut(slug); });
      return;
    }
    router.push(href("/login"));
  }, [slug, closeAll, router, href, serverMode]);

  // Session-created cases as seed rows (with their history) for src/features/demo/seed.ts.
  const copySnippet = useCallback(() => {
    const txt = exportSnippet(S);
    const n = S.cases.filter((c) => !c.seed).length;
    if (!txt) { showToast("Nothing new to copy — raise a case as the employee first."); return; }
    const done = () => showToast("Copied " + n + (n === 1 ? " case" : " cases") + " — paste into CASES in seed.ts.");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, () => window.prompt("Copy this into seed.ts:", txt));
    else window.prompt("Copy this into seed.ts:", txt);
  }, [S, showToast]);

  const value: DemoContext = {
    tenant, seed, ready, serverMode, S, D, N, log,
    role, setRole, leadAs, setLeadAs, persona, actor, email,
    demo, toggleDemo: () => setPrefs(slug, { demo: !demo }),
    dept, setDept: (id) => { setPrefs(slug, { dept: id }); setMenu(false); }, matches: (depts) => dept === "All" || depts.includes(dept), deptName,
    q, setQ, pop, setPop, togglePop: (p) => setPop((cur) => (cur === p ? null : p)),
    sheet, openSheet: (kind, id, init) => { setSheet({ kind, id, text: "", picked: null, people: [], ...init }); setPop(null); },
    closeSheet: () => setSheet(null), patchSheet: (p) => setSheet((s) => (s ? { ...s, ...p } : s)),
    toast, showToast, menu, setMenu, dev, setDev, act, resetDemo, deleteAdded, copySnippet, logout,
    f: dayFormatter(today, S.day), href,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
