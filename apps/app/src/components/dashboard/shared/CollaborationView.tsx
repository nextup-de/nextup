"use client";
// Collaboration across departments, three windows: the map (a mind map of the selection above the
// org tree, with the people on the same project joined up and a marker where it is waiting), the
// project window and the people window. Each window has its own search / sort / filter and pages. Click a project or a person; the
// window you clicked in grows to show the detail, like the ideas page.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar, Empty, Pill, statusTone } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import type { Initiative, InitiativeStatus, OrgPerson } from "@/features/demo/types";
import { chainEdges, coworkersOf, layoutTree, namedMembers, pairs, projectsOf, visiblePeople } from "@/features/org";
import { ini } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./CollaborationView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

type Sel = { kind: "project"; id: string } | { kind: "person"; name: string } | { kind: "none" };
type TreeMode = "chain" | "lines";
type ProjectSort = "wait" | "status" | "title" | "people";
type PersonSort = "name" | "dept" | "role";
type PeopleScope = "linked" | "all";

const INK = "#141414", BRAND = "#0b70d1", ACCENT = "#ff5a1f", MUTE = "#b9b9b4";
const edgeLook = (status: InitiativeStatus) =>
  status === "Shipped" ? { stroke: INK, dash: "0" } : status === "Awaiting decision" ? { stroke: ACCENT, dash: "0" } : status === "Proposed" ? { stroke: MUTE, dash: "7 7" } : { stroke: "#8c8c88", dash: "0" };
const STATUS_ORDER: InitiativeStatus[] = ["Awaiting decision", "In trial", "Building", "Proposed", "Shipped"];
const waitDays = (t: Initiative) => (t.status === "Awaiting decision" ? Number(/(\d+)/.exec(t.stage)?.[1] ?? 0) : -1);
const isNamed = (n: string) => n !== "—" && n !== "Anonymous";

// Mind map geometry: the selection in the middle, its satellites on an ellipse around it.
const MW = 620, MH = 250, MCX = MW / 2, MCY = MH / 2 + 4, MRX = 236, MRY = 86;
const satellite = (i: number, n: number) => {
  const a = ((-90 + (i * 360) / Math.max(n, 1)) * Math.PI) / 180;
  return { x: MCX + MRX * Math.cos(a), y: MCY + MRY * Math.sin(a) };
};
const spoke = (x: number, y: number) => "M " + MCX + " " + MCY + " Q " + (MCX + (x - MCX) * 0.5) + " " + (MCY + (y - MCY) * 0.15) + " " + x + " " + y;
// Two lines at most for the label in the middle.
const wrap2 = (s: string, max = 13): string[] => {
  if (s.length <= max) return [s];
  const cut = s.lastIndexOf(" ", max);
  const at = cut > 6 ? cut : max;
  const rest = s.slice(at + 1);
  return [s.slice(0, at), rest.length > max + 2 ? rest.slice(0, max) + "…" : rest];
};

// Org tree geometry, grid units from layoutTree() to pixels.
const TX = 74, TY = 80, TPX = 40, TPY = 34;

// Rows per page in the two windows. Fixed, so the page scrolls like every other view.
const PROJECT_PAGE = 5, PEOPLE_PAGE = 8;

// Pan + zoom for the org chart: wheel zooms around the cursor, drag pans, buttons for the rest.
// A click that moved less than 4px still counts as a click on a node.
type View = { k: number; x: number; y: number };
const KMIN = 0.25, KMAX = 3;
const fitView = (w: number, h: number, x0: number, y0: number, x1: number, y1: number, kmax: number): View => {
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const k = Math.min(kmax, (w - 24) / bw, (h - 24) / bh);
  return { k, x: (w - bw * k) / 2 - x0 * k, y: (h - bh * k) / 2 - y0 * k };
};
function useCanvas() {
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const node = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false); // while true the canvas moves without easing
  // Measured on demand: the canvas is laid out by CSS, so its box is always current here.
  const box = () => node.current?.getBoundingClientRect() ?? null;
  const attach = useCallback((el: HTMLDivElement | null) => {
    node.current = el;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(KMAX, Math.max(KMIN, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
  }, []);
  const zoomBy = (f: number) => {
    const r = box();
    setView((v) => {
      const k = Math.min(KMAX, Math.max(KMIN, v.k * f)), cx = (r?.width ?? 0) / 2, cy = (r?.height ?? 0) / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };
  // Fit a box (content units) into the canvas with a little margin; never closer than kmax.
  const fitBox = useCallback((x0: number, y0: number, x1: number, y1: number, kmax = KMAX) => {
    const r = node.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return;
    setView(fitView(r.width, r.height, x0, y0, x1, y1, kmax));
  }, []);
  const swallow = useRef(false); // the click that ends a drag must not select a node
  // Pointer capture would retarget the click to the canvas and nodes would stop being clickable,
  // so the drag follows the pointer on window instead.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    const d = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    drag.current = d;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) setDragging(true);
      d.moved = true;
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      swallow.current = d.moved;
      drag.current = null;
      setDragging(false);
      if (d.moved) setTimeout(() => { swallow.current = false; }, 0); // only the click that follows this release
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault(); } };
  return { attach, view, dragging, zoomBy, fitBox, handlers: { onPointerDown, onClickCapture } };
}

function Pager({ page, pages, from, to, total, onPage }: { page: number; pages: number; from: number; to: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className={styles.pager}>
      <span>{from}–{to} of {total}</span>
      {pages > 1 && (
        <span className={styles.pageBtns}>
          <button type="button" className={styles.pageBtn} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
          <span className={styles.pageNo}>{page + 1} / {pages}</span>
          <button type="button" className={styles.pageBtn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
        </span>
      )}
    </div>
  );
}

export function CollaborationView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { D, deptName, matches, ready, href } = ctx;
  const [sel, setSel] = useState<Sel>(initialId ? { kind: "project", id: initialId } : { kind: "none" });
  const [treeMode, setTreeMode] = useState<TreeMode>("chain");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const { attach: canvasAttach, view: cv, dragging, zoomBy, fitBox, handlers: canvasHandlers } = useCanvas();
  // Fit the whole chart when the canvas gets its size and whenever the set of drawn people changes.
  const [fit, setFit] = useState({ key: "", w: 0, h: 0 });
  useEffect(() => { if (fit.w) fitBox(0, 0, fit.w, fit.h, 1.6); }, [fitBox, fit]);
  // Project window tools.
  const [pq, setPq] = useState(""), [pSort, setPSort] = useState<ProjectSort>("wait"), [pFilter, setPFilter] = useState("All"), [pPage, setPPage] = useState(0);
  // People window tools.
  const [hq, setHq] = useState(""), [hSort, setHSort] = useState<PersonSort>("name"), [hDept, setHDept] = useState("All"), [hScope, setHScope] = useState<PeopleScope>("linked"), [hPage, setHPage] = useState(0);
  const pSize = PROJECT_PAGE, hSize = PEOPLE_PAGE;
  if (!ready) return <PageSkeleton kind="list" delay />;

  const byName = new Map(D.people.map((p) => [p.name, p]));
  // A member who has no org row (a name the seed forgot) still gets a card: role from the initiative.
  const personOf = (name: string): OrgPerson | null => {
    const p = byName.get(name);
    if (p) return p;
    const m = D.initiatives.flatMap((t) => t.members).find((x) => x.name === name);
    return m ? { name, role: m.role, dept: "", reportsTo: null } : null;
  };

  const st = sel.kind === "project" ? D.initiatives.find((t) => t.id === sel.id) ?? null : null;
  const sp = sel.kind === "person" ? personOf(sel.name) : null;

  // ── project window: scope + search + filter + sort, then pages ───────────────────────────
  const pToks = pq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pHay = (t: Initiative) => [t.name, t.why, t.status, ...t.depts.map(deptName), ...t.members.map((m) => m.name + " " + m.role), t.stuckOn?.name ?? ""].join(" ").toLowerCase();
  const pScoped = D.initiatives.filter((t) => matches(t.depts));
  const pSearched = pScoped.filter((t) => pToks.every((k) => pHay(t).includes(k)));
  const pPool = pSearched.filter((t) => pFilter === "All" || (pFilter === "Stuck" ? !!t.stuckOn : t.status === pFilter));
  const pSorted = [...pPool].sort((a, b) =>
    pSort === "wait" ? waitDays(b) - waitDays(a) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      : pSort === "status" ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name)
        : pSort === "people" ? b.people - a.people || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name));
  const pPages = Math.max(1, Math.ceil(pSorted.length / pSize)), pCur = Math.min(pPage, pPages - 1);
  const pRows = pSorted.slice(pCur * pSize, pCur * pSize + pSize);

  // ── people window ─────────────────────────────────────────────────────────────────────────
  const spProjects = sp ? projectsOf(D.initiatives, sp.name) : [];
  const spCoworkers = sp ? coworkersOf(D.initiatives, sp.name) : [];
  // Projects waiting on this person - whether or not they are a member (the CFO is not "on" the spend project).
  const stuckHere = sp ? D.initiatives.filter((t) => t.stuckOn?.name === sp.name) : [];
  const spWaiting = stuckHere.filter((t) => !spProjects.includes(t));
  const stMembers = st ? namedMembers(st) : [];
  const stuck = st?.stuckOn ?? null;

  type Row = { name: string; role: string; dept: string; right: React.ReactNode; click: boolean };
  const linkedRows: Row[] = st
    ? [
      ...st.members.map((m) => ({ name: m.name, role: m.role, dept: byName.get(m.name)?.dept ?? "", click: isNamed(m.name), right: stuck?.name === m.name ? <Pill tone="accent">waiting here</Pill> : m.role })),
      ...(stuck && !st.members.some((m) => m.name === stuck.name) ? [{ name: stuck.name, role: personOf(stuck.name)?.role ?? "", dept: personOf(stuck.name)?.dept ?? "", click: true, right: <Pill tone="accent">waiting on them</Pill> }] : []),
    ]
    : sp
      ? spCoworkers.map((c) => ({ name: c.name, role: personOf(c.name)?.role ?? "", dept: personOf(c.name)?.dept ?? "", click: true, right: c.shared.length === 1 ? c.shared[0].name : c.shared.length + " projects" }))
      : [];
  const onIt = new Set(linkedRows.map((r) => r.name));
  const allRows: Row[] = D.people.map((p) => ({
    name: p.name, role: p.role, dept: p.dept, click: true,
    right: stuck?.name === p.name ? <Pill tone="accent">waiting here</Pill> : onIt.has(p.name) ? <Pill tone="soft">{st ? "on it" : "works with"}</Pill> : deptName(p.dept),
  }));
  const scope: PeopleScope = st || sp ? hScope : "all";
  const hBase = scope === "linked" ? linkedRows : allRows;
  const hToks = hq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hSearched = hBase.filter((r) => hToks.every((k) => (r.name + " " + r.role + " " + deptName(r.dept)).toLowerCase().includes(k)));
  const hPool = hSearched.filter((r) => hDept === "All" || r.dept === hDept);
  const hSorted = [...hPool].sort((a, b) =>
    hSort === "dept" ? deptName(a.dept).localeCompare(deptName(b.dept)) || a.name.localeCompare(b.name)
      : hSort === "role" ? a.role.localeCompare(b.role) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
  const hPages = Math.max(1, Math.ceil(hSorted.length / hSize)), hCur = Math.min(hPage, hPages - 1);
  const hRows = hSorted.slice(hCur * hSize, hCur * hSize + hSize);
  const deptsInList = [...new Set(hSearched.map((r) => r.dept).filter(Boolean))].sort((a, b) => deptName(a).localeCompare(deptName(b)));

  // Clicking the selected thing again closes it.
  const pickProject = (id: string) => {
    if (st?.id === id) { setSel({ kind: "none" }); return; }
    setSel({ kind: "project", id });
    const i = pSorted.findIndex((t) => t.id === id);
    if (i >= 0) setPPage(Math.floor(i / pSize));
    setHPage(0);
  };
  const pickPerson = (name: string) => {
    if (!isNamed(name)) return;
    if (sp?.name === name) { setSel({ kind: "none" }); return; }
    setSel({ kind: "person", name });
    setHPage(0);
  };

  // ── the map ───────────────────────────────────────────────────────────────────────────────
  const litNames = new Set<string>(st ? stMembers.map((m) => m.name) : sp ? [sp.name, ...spCoworkers.map((c) => c.name)] : []);
  if (stuck) litNames.add(stuck.name);
  const treeLines: { a: string; b: string; stroke: string; dash: string }[] = st
    ? pairs(stMembers.map((m) => m.name)).map(([a, b]) => ({ a, b, ...edgeLook(st.status) }))
    : sp ? spCoworkers.map((c) => ({ a: sp.name, b: c.name, ...edgeLook(c.shared[0].status) })) : [];
  if (st && stuck) stMembers.forEach((m) => { if (m.name !== stuck.name) treeLines.push({ a: m.name, b: stuck.name, stroke: ACCENT, dash: "4 5" }); });
  if (sp) spWaiting.forEach((t) => namedMembers(t).forEach((m) => { litNames.add(m.name); treeLines.push({ a: m.name, b: sp.name, stroke: ACCENT, dash: "4 5" }); }));
  const stuckAt = new Map<string, string>(); // person -> what is waiting there, for the tree marker
  if (st && stuck) stuckAt.set(stuck.name, st.stage);
  if (sp) stuckHere.forEach((t) => stuckAt.set(sp.name, t.stage));

  const shown = visiblePeople(D.people, collapsed, [...litNames]);
  const tree = layoutTree(shown.people);
  const tw = tree.cols * TX + TPX * 2, th = tree.rows * TY + TPY * 2 - 10;
  const px = (x: number) => TPX + x * TX + TX / 2, py = (y: number) => TPY + y * TY;
  const pos = new Map(tree.nodes.map((n) => [n.person.name, { x: px(n.x), y: py(n.y) }]));
  const fitAll = () => fitBox(0, 0, tw, th, 1.6);
  const treeKey = shown.people.map((p) => p.name).join("|");
  if (treeKey !== fit.key) setFit({ key: treeKey, w: tw, h: th });
  const fitSelection = () => {
    const pts = [...litNames].map((n) => pos.get(n)).filter((q): q is { x: number; y: number } => !!q);
    if (!pts.length) return fitAll();
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    fitBox(Math.min(...xs) - 60, Math.min(...ys) - 50, Math.max(...xs) + 60, Math.max(...ys) + 50, 1.8);
  };
  const toggleFold = (name: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const hasReports = new Set(D.people.map((p) => p.reportsTo).filter((n): n is string => !!n));
  const orth = (a: { x: number; y: number }, b: { x: number; y: number }) => "M " + a.x + " " + a.y + " V " + (a.y + TY / 2) + " H " + b.x + " V " + b.y;
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, bulge = Math.min(28, len * 0.12);
    return "M " + a.x + " " + a.y + " Q " + ((a.x + b.x) / 2 - (dy / len) * bulge) + " " + ((a.y + b.y) / 2 + (dx / len) * bulge) + " " + b.x + " " + b.y;
  };
  // "Via the org chart": light up the reporting lines that join the people up instead of drawing
  // new ones - the chain of command the project runs through, and where on it the wait sits.
  const chain = treeMode === "chain" ? chainEdges(D.people, [...litNames]) : new Set<string>();
  const chainLook = st ? edgeLook(st.status) : edgeLook(stuckHere.length ? "Awaiting decision" : spCoworkers[0]?.shared[0].status ?? "Building");

  // Satellites of the mind map.
  const sats: { key: string; label: string; sub: string; stroke: string; dash: string; kind: "person" | "project"; hot: boolean; tag?: string; onClick: () => void }[] = st
    ? [
      ...stMembers.map((m) => ({ key: m.name, label: m.name, sub: m.role, ...edgeLook(st.status), kind: "person" as const, hot: stuck?.name === m.name, tag: stuck?.name === m.name ? st.stage : undefined, onClick: () => pickPerson(m.name) })),
      ...(stuck && !stMembers.some((m) => m.name === stuck.name)
        ? [{ key: stuck.name, label: stuck.name, sub: personOf(stuck.name)?.role ?? "", stroke: ACCENT, dash: "4 5", kind: "person" as const, hot: true, tag: st.stage, onClick: () => pickPerson(stuck.name) }]
        : []),
    ]
    : sp
      ? [
        ...spProjects.map((t) => ({ key: t.id, label: t.name, sub: t.stage, ...edgeLook(t.status), kind: "project" as const, hot: t.stuckOn?.name === sp.name, tag: t.stuckOn?.name === sp.name ? "stuck here" : undefined, onClick: () => pickProject(t.id) })),
        ...spWaiting.map((t) => ({ key: t.id, label: t.name, sub: t.stage, stroke: ACCENT, dash: "4 5", kind: "project" as const, hot: true, tag: "waiting on them", onClick: () => pickProject(t.id) })),
      ]
      : [];
  const centre = st ? wrap2(st.name) : sp ? [sp.name] : ["—"];
  const centreR = sp ? 30 : 44;
  const centreSub = st ? (stMembers.length ? stMembers.length + " people" : "nobody assigned") : sp ? sp.role : "";

  const emptyProjects = D.initiatives.length === 0;
  const reportsCount = sp ? D.people.filter((p) => p.reportsTo === sp.name).length : 0;

  return (
    <div className={`${styles.page} ${styles.enter}`}>
      <ViewHead view="network" />
      <div className={styles.layout}>
        {/* ── the map: mind map above, org tree below ───────────────────────── */}
        <div className={`${ui.card} ${styles.mapCard}`}>
          <div className={ui.between}>
            <div>
              <div className={ui.eyebrow}>{st ? "Project map" : sp ? "Person map" : "Map"}</div>
              <div className={ui.h}>{st ? st.name : sp ? sp.name : emptyProjects ? "Nothing to map yet" : "Nothing selected"}</div>
              <div className={ui.sub}>
                {st ? (stMembers.length ? "The people on it. " : "") + (stuck ? "Waiting on " + stuck.name + " - " + stuck.reason + "." : st.status === "Proposed" ? "Proposed - nobody assigned yet." : "Nothing is waiting on one person.")
                  : sp ? (spProjects.length ? sp.role + (sp.dept ? " · " + deptName(sp.dept) : "") + " - on " + spProjects.length + (spProjects.length === 1 ? " project" : " projects") + "." : sp.role + " - not on a cross-team project.") + (stuckHere.length ? " " + stuckHere.length + (stuckHere.length === 1 ? " project is" : " projects are") + " waiting on them." : "")
                  : emptyProjects ? "The first case that needs two departments draws the first project." : "Click a project or a person to map who is joined up and where it is waiting."}
              </div>
            </div>
            {st && <Pill tone={statusTone(st.status)}>{st.status}</Pill>}
            {sp && stuckHere.length > 0 && <Pill tone="accent">waiting on them</Pill>}
          </div>

          {(st || sp) && (
            <svg key={st ? st.id : sp?.name} viewBox={"0 0 " + MW + " " + MH} className={styles.mind} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mind map of the selection">
              {sats.map((s, i) => { const p = satellite(i, sats.length); return <path key={"s" + s.key} d={spoke(p.x, p.y)} fill="none" stroke={s.stroke} strokeWidth={s.hot ? 2.2 : 1.6} strokeDasharray={s.dash} strokeLinecap="round" />; })}
              <g className={styles.node}>
                <circle cx={MCX} cy={MCY} r={centreR} fill={INK} />
                {sp ? (
                  <text x={MCX} y={MCY} dy={5} textAnchor="middle" className={styles.centreIni}>{ini(sp.name)}</text>
                ) : (
                  centre.map((line, k) => <text key={k} x={MCX} y={MCY + (k - (centre.length - 1) / 2) * 13} dy={4} textAnchor="middle" className={styles.centreText}>{line}</text>)
                )}
                <text x={MCX} y={MCY + centreR + 15} textAnchor="middle" className={styles.nodeMeta}>{centreSub}</text>
              </g>
              {sats.map((s, i) => {
                const p = satellite(i, sats.length);
                const below = p.y >= MCY;
                return (
                  <g key={s.key} className={styles.node} onClick={s.onClick}>
                    {s.hot && <circle cx={p.x} cy={p.y} r={s.kind === "person" ? 22 : 20} fill="none" stroke={ACCENT} strokeWidth={2.2} />}
                    {s.kind === "person" ? (
                      <>
                        <circle cx={p.x} cy={p.y} r={16} fill="#fff" stroke={INK} strokeWidth={1.3} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeIni}>{ini(s.label)}</text>
                      </>
                    ) : (
                      <>
                        <circle cx={p.x} cy={p.y} r={14} fill={s.stroke === MUTE ? "#fff" : s.stroke} stroke={INK} strokeWidth={1.2} strokeDasharray={s.dash} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeIni} fill={s.stroke === MUTE ? INK : "#fff"}>{i + 1}</text>
                      </>
                    )}
                    <text x={p.x} y={below ? p.y + 30 : p.y - 34} textAnchor="middle" className={styles.nodeTitle}>{s.kind === "project" ? wrap2(s.label, 24)[0] : s.label}</text>
                    <text x={p.x} y={below ? p.y + 42 : p.y - 23} textAnchor="middle" className={styles.nodeMeta}>{s.tag ? s.tag : s.sub}</text>
                  </g>
                );
              })}
            </svg>
          )}

          <div className={`${ui.between} ${styles.treeHead}`}>
            <div className={ui.eyebrow}>Who reports to whom</div>
            {D.people.length > 0 && (
              <div className={styles.seg} role="group" aria-label="How to draw the connections">
                <button type="button" className={styles.segBtn} data-on={treeMode === "chain" ? "true" : undefined} onClick={() => setTreeMode("chain")}>Via the org chart</button>
                <button type="button" className={styles.segBtn} data-on={treeMode === "lines" ? "true" : undefined} onClick={() => setTreeMode("lines")}>Direct lines</button>
              </div>
            )}
          </div>
          {D.people.length === 0 ? (
            <div className={ui.emptyLine}>The org chart fills in as members are invited.</div>
          ) : (
            <div className={styles.treeWrap} ref={canvasAttach} data-dragging={dragging ? "true" : undefined} {...canvasHandlers}>
              <svg className={styles.tree} role="img" aria-label="Org chart">
                <g className={styles.canvas} transform={"translate(" + cv.x + " " + cv.y + ") scale(" + cv.k + ")"}>
                  {tree.edges.map((e) => { const a = pos.get(e.from)!, b = pos.get(e.to)!, on = chain.has(e.from + ">" + e.to); return <path key={e.from + e.to} d={orth(a, b)} fill="none" stroke={on ? chainLook.stroke : "#e6e5e0"} strokeWidth={on ? 2.6 : 1.2} strokeDasharray={on ? chainLook.dash : undefined} strokeLinecap="round" />; })}
                  {treeMode === "lines" && treeLines.map((l) => { const a = pos.get(l.a), b = pos.get(l.b); return a && b ? <path key={l.a + l.b} d={curve(a, b)} fill="none" stroke={l.stroke} strokeWidth={1.8} strokeDasharray={l.dash} strokeLinecap="round" opacity={0.9} /> : null; })}
                  {tree.nodes.map((n) => {
                    const p = pos.get(n.person.name)!;
                    const lit = litNames.has(n.person.name), me = sp?.name === n.person.name, tag = stuckAt.get(n.person.name);
                    const dim = (st || sp) && !lit;
                    const hidden = shown.folded.get(n.person.name) ?? 0;
                    return (
                      <g key={n.person.name} className={styles.node} opacity={dim ? 0.38 : 1} onClick={() => pickPerson(n.person.name)}>
                        {tag && <circle cx={p.x} cy={p.y} r={21} fill="none" stroke={ACCENT} strokeWidth={2.2} />}
                        <circle cx={p.x} cy={p.y} r={15} fill={lit ? INK : "#fff"} stroke={me ? BRAND : INK} strokeWidth={me ? 2.2 : 1.2} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeIni} fill={lit ? "#fff" : INK}>{ini(n.person.name)}</text>
                        <text x={p.x} y={p.y + 27} textAnchor="middle" className={styles.nodeTitle}>{n.person.name}</text>
                        <text x={p.x} y={p.y + 38} textAnchor="middle" className={styles.nodeMeta}>{n.person.role}</text>
                        {tag && (
                          <g>
                            <rect x={p.x - 34} y={p.y - 40} width={68} height={15} rx={7} fill={ACCENT} />
                            <text x={p.x} y={p.y - 32} dy={3} textAnchor="middle" className={styles.tag}>{tag}</text>
                          </g>
                        )}
                        {hasReports.has(n.person.name) && (
                          <g className={styles.fold} onClick={(e) => { e.stopPropagation(); toggleFold(n.person.name); }}>
                            <rect x={p.x - (hidden ? 16 : 8)} y={p.y + 43} width={hidden ? 32 : 16} height={13} rx={6.5} fill={hidden ? INK : "#fff"} stroke={INK} strokeWidth={1} />
                            <text x={p.x} y={p.y + 49.5} dy={3} textAnchor="middle" className={styles.foldText} fill={hidden ? "#fff" : INK}>{hidden ? "+" + hidden : "\u2212"}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className={styles.zoom}>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out">{"\u2212"}</button>
                <span className={styles.zoomPct}>{Math.round(cv.k * 100)}%</span>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1.3)} aria-label="Zoom in">+</button>
                <button type="button" className={styles.zoomBtn} data-wide="true" onClick={fitAll}>Fit all</button>
                <button type="button" className={styles.zoomBtn} data-wide="true" onClick={fitSelection} disabled={litNames.size === 0}>Zoom to selection</button>
                {collapsed.size > 0 && <button type="button" className={styles.zoomBtn} data-wide="true" onClick={() => setCollapsed(new Set())}>Unfold all</button>}
              </div>
            </div>
          )}

          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.swatch} /> shipped</span>
            <span className={styles.legendItem}><span className={styles.swatch} data-tone="running" /> running now</span>
            <span className={styles.legendItem}><span className={styles.swatch} data-tone="accent" /> waiting on a decision</span>
            <span className={styles.legendItem}><span className={styles.swatchDashed} /> proposed, nobody assigned</span>
            <span className={styles.legendItem}><span className={styles.ring} /> where it is stuck</span>
          </div>
        </div>

        {/* ── right: the project window, then the people window ─────────────── */}
        <div className={styles.side}>
          <div className={`${ui.card} ${styles.win}`} data-expanded={st ? "true" : undefined}>
            <div className={ui.between}>
              <div className={ui.h}>Projects</div>
              <span className={ui.small}>{pSorted.length} of {D.initiatives.length}</span>
            </div>
            {!emptyProjects && (
              <div className={styles.tools}>
                <input className={styles.search} type="search" placeholder="Search projects" value={pq} onChange={(e) => { setPq(e.target.value); setPPage(0); }} aria-label="Search projects" />
                <select className={styles.select} value={pSort} onChange={(e) => { setPSort(e.target.value as ProjectSort); setPPage(0); }} aria-label="Sort projects">
                  <option value="wait">Waiting longest</option>
                  <option value="status">By status</option>
                  <option value="people">Most people</option>
                  <option value="title">A → Z</option>
                </select>
                <select className={styles.select} data-on={pFilter !== "All" ? "true" : undefined} value={pFilter} onChange={(e) => { setPFilter(e.target.value); setPPage(0); }} aria-label="Filter projects">
                  <option value="All">All statuses</option>
                  <option value="Stuck">Stuck on someone</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {st && (
              <div key={st.id} className={styles.detail}>
                <div className={ui.eyebrow}>Selected project</div>
                <div className={styles.detailTitle}>{st.name}</div>
                <div className={`${ui.chips} ${styles.selMeta}`}>
                  <Pill tone={statusTone(st.status)}>{st.status}</Pill>
                  <span className={ui.small}>{st.stage}</span>
                  {st.depts.map((d) => <span key={d} className={styles.deptMini}>{deptName(d)}</span>)}
                </div>
                <div className={`${ui.body} ${styles.why}`}>Started because: {st.why}</div>
                {stuck && (
                  <div className={styles.stuck} onClick={() => pickPerson(stuck.name)}>
                    <Avatar name={stuck.name} size="sm" />
                    <span><b>Stuck at {stuck.name}</b> - {stuck.reason}</span>
                  </div>
                )}
                <div className={styles.go}>
                  {st.idea ? (
                    <Link href={href("/ideas?id=" + st.idea)} className={styles.goBtn}>Open on the Ideas page →</Link>
                  ) : st.status === "Shipped" ? (
                    <Link href={href("/progress")} className={styles.goBtn}>See the outcome on Progress →</Link>
                  ) : (
                    <span className={styles.goNone}>No idea page yet - started from a case.</span>
                  )}
                  <button type="button" className={ui.textlink} onClick={() => setSel({ kind: "none" })}>Close</button>
                </div>
              </div>
            )}
            <div className={styles.listBox}>
              {emptyProjects && <Empty title="Nothing yet" sub="The first case that needs two departments draws the first project." />}
              {!emptyProjects && pSorted.length === 0 && <div className={ui.emptyLine}>No project matches.</div>}
              <div className={ui.list}>
                {pRows.map((t) => {
                  const mine = sp ? t.members.some((m) => m.name === sp.name) || t.stuckOn?.name === sp.name : false;
                  return (
                    <div key={t.id} className={ui.row} data-active={st?.id === t.id || mine ? "true" : undefined} onClick={() => pickProject(t.id)}>
                      <div className={ui.mark} />
                      <div className={ui.rowBody}>
                        <div className={styles.allRow}>
                          <span className={ui.tileTitle}>{t.name}</span>
                          <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                        </div>
                        <div className={styles.allMeta}>{t.depts.map(deptName).join(" × ")} · {t.people ? t.people + " people" : "nobody assigned"}{t.stuckOn ? " · stuck at " + t.stuckOn.name : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Pager page={pCur} pages={pPages} from={pSorted.length ? pCur * pSize + 1 : 0} to={Math.min(pSorted.length, (pCur + 1) * pSize)} total={pSorted.length} onPage={setPPage} />
          </div>

          <div className={`${ui.card} ${styles.win}`} data-expanded={sp ? "true" : undefined}>
            <div className={ui.between}>
              <div className={ui.h}>{sp ? "Person" : "People"}</div>
              {(st || sp) && (
                <div className={styles.seg} role="group" aria-label="Which people to list">
                  <button type="button" className={styles.segBtn} data-on={scope === "linked" ? "true" : undefined} onClick={() => { setHScope("linked"); setHPage(0); }}>{st ? "On it" : "Works with"}</button>
                  <button type="button" className={styles.segBtn} data-on={scope === "all" ? "true" : undefined} onClick={() => { setHScope("all"); setHPage(0); }}>Everyone</button>
                </div>
              )}
            </div>
            {D.people.length > 0 && (
              <div className={styles.tools}>
                <input className={styles.search} type="search" placeholder="Search people" value={hq} onChange={(e) => { setHq(e.target.value); setHPage(0); }} aria-label="Search people" />
                <select className={styles.select} value={hSort} onChange={(e) => { setHSort(e.target.value as PersonSort); setHPage(0); }} aria-label="Sort people">
                  <option value="name">A → Z</option>
                  <option value="dept">By department</option>
                  <option value="role">By role</option>
                </select>
                <select className={styles.select} data-on={hDept !== "All" ? "true" : undefined} value={hDept} onChange={(e) => { setHDept(e.target.value); setHPage(0); }} aria-label="Filter people by department">
                  <option value="All">All departments</option>
                  {deptsInList.map((d) => <option key={d} value={d}>{deptName(d)}</option>)}
                </select>
              </div>
            )}

            {sp && (
              <div key={sp.name} className={styles.detail}>
                <div className={styles.who}>
                  <Avatar name={sp.name} size="lg" />
                  <div>
                    <div className={styles.detailTitle}>{sp.name}</div>
                    <div className={ui.small}>{sp.role}{sp.dept ? " · " + deptName(sp.dept) : ""}</div>
                  </div>
                </div>
                <div className={`${ui.note} ${ui.mt8}`}>
                  {sp.reportsTo ? <>Reports to <button type="button" className={ui.textlink} onClick={() => pickPerson(sp.reportsTo ?? "")}>{sp.reportsTo}</button>. </> : sp.dept ? "Top of the company. " : ""}
                  {reportsCount ? reportsCount + (reportsCount === 1 ? " person reports" : " people report") + " to them. " : ""}
                  {spProjects.length ? "On " + spProjects.map((t) => t.name).join(", ") + "." : "Not on a cross-team project."}
                </div>
                {stuckHere.map((t) => (
                  <div key={t.id} className={styles.stuck} onClick={() => pickProject(t.id)}>
                    <span><b>{t.name}</b> is waiting on them - {t.stuckOn?.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.listBox}>
              {D.people.length === 0 && !st && <div className={ui.emptyLine}>People appear here as members are invited.</div>}
              {hBase.length > 0 && hSorted.length === 0 && <div className={ui.emptyLine}>Nobody matches.</div>}
              {hBase.length === 0 && (st || sp) && <div className={ui.emptyLine}>{st ? "Nobody assigned yet." : "Works with nobody yet."}</div>}
              <div className={styles.members}>
                {hRows.map((r) => (
                  <div key={r.name + r.role} className={ui.personRow} data-click={r.click ? "true" : undefined} data-active={sp?.name === r.name ? "true" : undefined} onClick={() => r.click && pickPerson(r.name)}>
                    <Avatar name={r.name} />
                    <span className={styles.memberName}>{r.name === "—" ? "Nobody assigned" : r.name}</span>
                    <span className={styles.memberRole}>{r.right}</span>
                  </div>
                ))}
              </div>
            </div>
            <Pager page={hCur} pages={hPages} from={hSorted.length ? hCur * hSize + 1 : 0} to={Math.min(hSorted.length, (hCur + 1) * hSize)} total={hSorted.length} onPage={setHPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
