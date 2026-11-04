"use client";
// Collaboration across departments, three windows: the map (a mind map of the selection above the
// org tree, with the people on the same project joined up and a marker where it is waiting), the
// project window and the people window. Each window has its own search / sort / filter and pages. Click a project or a person; the
// window you clicked in grows to show the detail, like the ideas page.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Empty, Pill, statusTone, wordText } from "@/components/dashboard/shared/primitives";
import { DataTable, DeptChip, PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import { avatarTone } from "@/lib/avatar";
import type { Initiative, InitiativeStatus, OrgPerson } from "@/features/demo/types";
import { chainEdges, coworkersOf, layoutTree, namedMembers, pairs, projectsOf, visiblePeople } from "@/features/org";
import type { State } from "@/features/cases/reducer";
import { splitBody } from "@/features/ideas/brief";
import type { ReducedProject } from "@/features/projects/types";
import { asInitiatives, visibleProjectsFor } from "@/features/projects/views";
import { idViewerOf } from "@/components/projects/parts";
import { useT } from "@/i18n/client";
import { ini } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./CollaborationView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { useIdInUrl } from "@/lib/use-url-id";

type Sel = { kind: "project"; id: string } | { kind: "person"; name: string } | { kind: "none" };
type TreeMode = "chain" | "lines";
type ProjectSort = "wait" | "status" | "title" | "people";
type PersonSort = "name" | "dept" | "role";
type PeopleScope = "linked" | "all";

const INK = "#141414", ACCENT = "#ff5a1f", MUTE = "#b9b9b4";
// The statuses in the order the lists use; the first is the one that waits on a decision.
const STATUS_ORDER = Object.keys({ "Awaiting decision": 0, "In trial": 0, Building: 0, Proposed: 0, Shipped: 0 } satisfies Record<InitiativeStatus, 0>) as InitiativeStatus[];
const AWAITING = STATUS_ORDER[0];
const ASPECT = ["xMidYMid", "meet"].join(" "); // the map scales to fit its box
const edgeLook = (status: InitiativeStatus) =>
  status === "Shipped" ? { stroke: INK, dash: "0" } : status === AWAITING ? { stroke: ACCENT, dash: "0" } : status === "Proposed" ? { stroke: MUTE, dash: "7 7" } : { stroke: "#8c8c88", dash: "0" };
const waitDays = (t: Initiative) => (t.status === AWAITING ? Number(/(\d+)/.exec(t.stage)?.[1] ?? 0) : -1);
const isNamed = (n: string) => n !== "—" && n !== "Anonymous";
// "Started because: ..." for a project - the first sentence of the idea it came from.
const firstSentence = (s: string) => (/^.*?[.!?](\s|$)/.exec(s.trim())?.[0] ?? s).trim();
const whyOf = (S: State, p: ReducedProject) => {
  const c = S.cases.find((x) => p.sources.includes(x.id));
  if (c) return firstSentence(splitBody(c.body).description || c.title);
  const i = S.ideas.find((x) => p.sources.includes(x.id));
  return firstSentence(i?.rationale || p.title);
};

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

export function CollaborationView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { D, deptName, matches, ready, href } = ctx;
  const t = useT();
  const [sel, setSel] = useState<Sel>(initialId ? { kind: "project", id: initialId } : { kind: "none" });
  // A picked initiative is in the address (?id=); a picked person is not, their page has its own.
  useIdInUrl(sel.kind === "project" ? sel.id : null, (id) => setSel(id ? { kind: "project", id } : { kind: "none" }));
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

  // With projects on, the project window lists the real projects (features/projects), not the
  // made-up initiatives of the seed; stopped ones wait nowhere and are left out.
  const projectMode = ctx.flag("projects");
  const initiatives: Initiative[] = projectMode
    ? asInitiatives(visibleProjectsFor(ctx.S, idViewerOf(ctx), ctx.demo),
      (name) => ctx.seed.people.find((x) => x.name === name)?.dept ?? null, deptName, (p) => whyOf(ctx.S, p))
    : D.initiatives;

  const byName = new Map(D.people.map((p) => [p.name, p]));
  // A member who has no org row (a name the seed forgot) still gets a card: role from the initiative.
  const personOf = (name: string): OrgPerson | null => {
    const p = byName.get(name);
    if (p) return p;
    const m = initiatives.flatMap((t) => t.members).find((x) => x.name === name);
    return m ? { name, role: m.role, dept: "", reportsTo: null } : null;
  };

  const st = sel.kind === "project" ? initiatives.find((t) => t.id === sel.id) ?? null : null;
  const sp = sel.kind === "person" ? personOf(sel.name) : null;

  // ── project window: scope + search + filter + sort, then pages ───────────────────────────
  const pToks = pq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pHay = (t: Initiative) => [t.name, t.why, t.status, ...t.depts.map(deptName), ...t.members.map((m) => m.name + " " + m.role), t.stuckOn?.name ?? ""].join(" ").toLowerCase();
  const pScoped = initiatives.filter((t) => matches(t.depts));
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
  const spProjects = sp ? projectsOf(initiatives, sp.name) : [];
  const spCoworkers = sp ? coworkersOf(initiatives, sp.name) : [];
  // Projects waiting on this person - whether or not they are a member (the CFO is not "on" the spend project).
  const stuckHere = sp ? initiatives.filter((t) => t.stuckOn?.name === sp.name) : [];
  const spWaiting = stuckHere.filter((t) => !spProjects.includes(t));
  const stMembers = st ? namedMembers(st) : [];
  const stuck = st?.stuckOn ?? null;

  type Row = { name: string; role: string; dept: string; right: React.ReactNode; click: boolean };
  const linkedRows: Row[] = st
    ? [
      ...st.members.map((m) => ({ name: m.name, role: m.role, dept: byName.get(m.name)?.dept ?? "", click: isNamed(m.name), right: stuck?.name === m.name ? <Pill tone="accent">{t("dashboard.collabWaitingHere")}</Pill> : m.role })),
      ...(stuck && !st.members.some((m) => m.name === stuck.name) ? [{ name: stuck.name, role: personOf(stuck.name)?.role ?? "", dept: personOf(stuck.name)?.dept ?? "", click: true, right: <Pill tone="accent">{t("dashboard.collabWaitingOnThem")}</Pill> }] : []),
    ]
    : sp
      ? spCoworkers.map((c) => ({ name: c.name, role: personOf(c.name)?.role ?? "", dept: personOf(c.name)?.dept ?? "", click: true, right: c.shared.length === 1 ? c.shared[0].name : t("dashboard.collabNProjects", { count: c.shared.length }) }))
      : [];
  const onIt = new Set(linkedRows.map((r) => r.name));
  const allRows: Row[] = D.people.map((p) => ({
    name: p.name, role: p.role, dept: p.dept, click: true,
    right: stuck?.name === p.name ? <Pill tone="accent">{t("dashboard.collabWaitingHere")}</Pill> : onIt.has(p.name) ? <Pill tone="soft">{st ? t("dashboard.collabOnIt") : t("dashboard.collabWorksWith")}</Pill> : p.dept ? <DeptChip name={deptName(p.dept)} /> : "",
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
  const paging = (cur: number, pages: number, from: number, to: number, total: number, go: (p: number) => void) => ({
    line: t("dashboard.collabPager", { from, to, total }),
    prevLabel: t("dashboard.collabPrevPage"),
    nextLabel: t("dashboard.collabNextPage"),
    onPrev: cur > 0 ? () => go(cur - 1) : undefined,
    onNext: cur < pages - 1 ? () => go(cur + 1) : undefined,
  });
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
  const chainLook = st ? edgeLook(st.status) : edgeLook(stuckHere.length ? AWAITING : spCoworkers[0]?.shared[0].status ?? "Building");

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
        ...spProjects.map((pr) => ({ key: pr.id, label: pr.name, sub: pr.stage, ...edgeLook(pr.status), kind: "project" as const, hot: pr.stuckOn?.name === sp.name, tag: pr.stuckOn?.name === sp.name ? t("dashboard.collabStuckHere") : undefined, onClick: () => pickProject(pr.id) })),
        ...spWaiting.map((pr) => ({ key: pr.id, label: pr.name, sub: pr.stage, stroke: ACCENT, dash: "4 5", kind: "project" as const, hot: true, tag: t("dashboard.collabWaitingOnThem"), onClick: () => pickProject(pr.id) })),
      ]
      : [];
  const centre = st ? wrap2(st.name) : sp ? [sp.name] : ["—"];
  const centreR = sp ? 30 : 44;
  const centreSub = st ? (stMembers.length ? t("dashboard.collabNPeople", { n: stMembers.length }) : t("dashboard.collabNobodyAssigned")) : sp ? sp.role : "";

  const emptyProjects = initiatives.length === 0;
  const reportsCount = sp ? D.people.filter((p) => p.reportsTo === sp.name).length : 0;

  return (
    <div className={`${styles.page} ${styles.enter}`}>
      <PageHeader title={t("dashboard.viewNetworkTitle")} lede={t("dashboard.viewNetworkSub")} />
      <div className={styles.layout}>
        {/* ── the map: mind map above, org tree below ───────────────────────── */}
        <SectionCard name="map">
          <div className={ui.between}>
            <div>
              <div className={styles.eyebrow}>{st ? t("dashboard.collabProjectMap") : sp ? t("dashboard.collabPersonMap") : t("dashboard.collabMap")}</div>
              <div className={styles.h}>{st ? st.name : sp ? sp.name : emptyProjects ? t("dashboard.collabNothingToMap") : t("dashboard.collabNothingSelected")}</div>
              <div className={styles.sub}>
                {st ? (stMembers.length ? t("dashboard.collabPeopleOnIt") + " " : "") + (stuck ? t("dashboard.collabWaitingOn", { name: stuck.name, reason: stuck.reason }) : st.status === "Proposed" ? t("dashboard.collabProposedNobody") : t("dashboard.collabNothingOnePerson"))
                  : sp ? (spProjects.length ? t("dashboard.collabRoleOn", { head: sp.role + (sp.dept ? " · " + deptName(sp.dept) : ""), count: spProjects.length }) : t("dashboard.collabRoleNotOn", { role: sp.role })) + (stuckHere.length ? " " + t("dashboard.collabWaitingOnThemN", { count: stuckHere.length }) : "")
                  : emptyProjects ? t("dashboard.collabFirstCase") : t("dashboard.collabClickToMap")}
              </div>
            </div>
            {st && <Pill tone={statusTone(st.status)}>{wordText(t, st.status)}</Pill>}
            {sp && stuckHere.length > 0 && <Pill tone="accent">{t("dashboard.collabWaitingOnThem")}</Pill>}
          </div>

          {(st || sp) && (
            <svg key={st ? st.id : sp?.name} viewBox={"0 0 " + MW + " " + MH} className={styles.mind} preserveAspectRatio={ASPECT} role="img" aria-label={t("dashboard.collabMindMap")}>
              {sats.map((s, i) => { const p = satellite(i, sats.length); return <path key={"s" + s.key} d={spoke(p.x, p.y)} fill="none" stroke={s.stroke} strokeWidth={s.hot ? 2.2 : 1.6} strokeDasharray={s.dash} strokeLinecap="round" />; })}
              <g className={styles.node} data-avatar={sp ? avatarTone(sp.name) : undefined}>
                {sp ? <circle cx={MCX} cy={MCY} r={centreR} className={styles.dot} data-lit="true" /> : <circle cx={MCX} cy={MCY} r={centreR} fill={INK} />}
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
                  <g key={s.key} className={styles.node} onClick={s.onClick} data-avatar={s.kind === "person" ? avatarTone(s.label) : undefined}>
                    {s.hot && <circle cx={p.x} cy={p.y} r={s.kind === "person" ? 22 : 20} fill="none" stroke={ACCENT} strokeWidth={2.2} />}
                    {s.kind === "person" ? (
                      <>
                        <circle cx={p.x} cy={p.y} r={16} className={styles.dot} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeIni}>{ini(s.label)}</text>
                      </>
                    ) : (
                      <>
                        <circle cx={p.x} cy={p.y} r={14} fill={s.stroke === MUTE ? "#fff" : s.stroke} stroke={INK} strokeWidth={1.2} strokeDasharray={s.dash} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeNum} data-light={s.stroke === MUTE ? "true" : undefined}>{i + 1}</text>
                      </>
                    )}
                    <text x={p.x} y={below ? p.y + 30 : p.y - 37} textAnchor="middle" className={styles.nodeTitle}>{s.kind === "project" ? wrap2(s.label, 24)[0] : s.label}</text>
                    <text x={p.x} y={below ? p.y + 42 : p.y - 23} textAnchor="middle" className={styles.nodeMeta}>{s.tag ? s.tag : s.sub}</text>
                  </g>
                );
              })}
            </svg>
          )}

          <div className={`${ui.between} ${styles.treeHead}`}>
            <div className={styles.eyebrow}>{t("dashboard.collabWhoReports")}</div>
            {D.people.length > 0 && (
              <div className={styles.seg} role="group" aria-label={t("dashboard.collabHowDraw")}>
                <button type="button" className={styles.segBtn} data-on={treeMode === "chain" ? "true" : undefined} onClick={() => setTreeMode("chain")}>{t("dashboard.collabViaOrg")}</button>
                <button type="button" className={styles.segBtn} data-on={treeMode === "lines" ? "true" : undefined} onClick={() => setTreeMode("lines")}>{t("dashboard.collabDirect")}</button>
              </div>
            )}
          </div>
          {D.people.length === 0 ? (
            <div className={ui.emptyLine}>{t("dashboard.collabOrgFills")}</div>
          ) : (
            <div className={styles.treeWrap} ref={canvasAttach} data-dragging={dragging ? "true" : undefined} {...canvasHandlers}>
              <svg className={styles.tree} role="img" aria-label={t("dashboard.collabOrgChart")}>
                <g className={styles.canvas} transform={"translate(" + cv.x + " " + cv.y + ") scale(" + cv.k + ")"}>
                  {tree.edges.map((e) => { const a = pos.get(e.from)!, b = pos.get(e.to)!, on = chain.has(e.from + ">" + e.to); return <path key={e.from + e.to} d={orth(a, b)} fill="none" stroke={on ? chainLook.stroke : "#e6e5e0"} strokeWidth={on ? 2.6 : 1.2} strokeDasharray={on ? chainLook.dash : undefined} strokeLinecap="round" />; })}
                  {treeMode === "lines" && treeLines.map((l) => { const a = pos.get(l.a), b = pos.get(l.b); return a && b ? <path key={l.a + l.b} d={curve(a, b)} fill="none" stroke={l.stroke} strokeWidth={1.8} strokeDasharray={l.dash} strokeLinecap="round" opacity={0.9} /> : null; })}
                  {tree.nodes.map((n) => {
                    const p = pos.get(n.person.name)!;
                    const lit = litNames.has(n.person.name), me = sp?.name === n.person.name, tag = stuckAt.get(n.person.name);
                    const dim = (st || sp) && !lit;
                    const hidden = shown.folded.get(n.person.name) ?? 0;
                    return (
                      <g key={n.person.name} className={styles.node} opacity={dim ? 0.38 : 1} onClick={() => pickPerson(n.person.name)} data-avatar={avatarTone(n.person.name)}>
                        {tag && <circle cx={p.x} cy={p.y} r={21} fill="none" stroke={ACCENT} strokeWidth={2.2} />}
                        <circle cx={p.x} cy={p.y} r={15} className={styles.dot} data-lit={lit ? "true" : undefined} data-me={me ? "true" : undefined} />
                        <text x={p.x} y={p.y} dy={4} textAnchor="middle" className={styles.nodeIni}>{ini(n.person.name)}</text>
                        <text x={p.x} y={p.y + 27} textAnchor="middle" className={styles.nodeTitle}>{n.person.name}</text>
                        <text x={p.x} y={p.y + 40} textAnchor="middle" className={styles.nodeMeta}>{n.person.role}</text>
                        {tag && (
                          <g>
                            <rect x={p.x - 34} y={p.y - 40} width={68} height={15} rx={7} fill={ACCENT} />
                            <text x={p.x} y={p.y - 32} dy={3} textAnchor="middle" className={styles.tag}>{tag}</text>
                          </g>
                        )}
                        {hasReports.has(n.person.name) && (
                          <g className={styles.fold} onClick={(e) => { e.stopPropagation(); toggleFold(n.person.name); }}>
                            <rect x={p.x - (hidden ? 16 : 8)} y={p.y + 46} width={hidden ? 32 : 16} height={13} rx={6.5} fill={hidden ? INK : "#fff"} stroke={INK} strokeWidth={1} />
                            <text x={p.x} y={p.y + 52.5} dy={3} textAnchor="middle" className={styles.foldText} fill={hidden ? "#fff" : INK}>{hidden ? "+" + hidden : "\u2212"}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className={styles.zoom}>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1 / 1.3)} aria-label={t("dashboard.collabZoomOut")}>{"\u2212"}</button>
                <span className={styles.zoomPct}>{Math.round(cv.k * 100)}%</span>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1.3)} aria-label={t("dashboard.collabZoomIn")}>+</button>
                <button type="button" className={styles.zoomBtn} data-wide="true" onClick={fitAll}>{t("dashboard.collabFitAll")}</button>
                <button type="button" className={styles.zoomBtn} data-wide="true" onClick={fitSelection} disabled={litNames.size === 0}>{t("dashboard.collabZoomSel")}</button>
                {collapsed.size > 0 && <button type="button" className={styles.zoomBtn} data-wide="true" onClick={() => setCollapsed(new Set())}>{t("dashboard.collabUnfold")}</button>}
              </div>
            </div>
          )}

          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.swatch} /> {t("dashboard.collabLegendShipped")}</span>
            <span className={styles.legendItem}><span className={styles.swatch} data-tone="running" /> {t("dashboard.collabLegendRunning")}</span>
            <span className={styles.legendItem}><span className={styles.swatch} data-tone="accent" /> {t("dashboard.collabLegendWaiting")}</span>
            <span className={styles.legendItem}><span className={styles.swatchDashed} /> {t("dashboard.collabLegendProposed")}</span>
            <span className={styles.legendItem}><span className={styles.ring} /> {t("dashboard.collabLegendStuck")}</span>
          </div>
        </SectionCard>

        {/* ── right: the project window, then the people window ─────────────── */}
        <div className={styles.side}>
          <div className={styles.win} data-expanded={st ? "true" : undefined}>
           <SectionCard name="projects">
            <div className={ui.between}>
              <div className={styles.h}>{t("dashboard.collabProjects")}</div>
              <span className={ui.small}>{t("dashboard.collabCountOf", { n: pSorted.length, total: initiatives.length })}</span>
            </div>
            {!emptyProjects && (
              <div className={styles.tools}>
                <input className={styles.search} type="search" placeholder={t("dashboard.collabSearchProjects")} value={pq} onChange={(e) => { setPq(e.target.value); setPPage(0); }} aria-label={t("dashboard.collabSearchProjects")} />
                <select className={styles.select} value={pSort} onChange={(e) => { setPSort(e.target.value as ProjectSort); setPPage(0); }} aria-label={t("dashboard.collabSortProjects")}>
                  <option value="wait">{t("dashboard.collabSortWait")}</option>
                  <option value="status">{t("dashboard.collabSortStatus")}</option>
                  <option value="people">{t("dashboard.collabSortPeople")}</option>
                  <option value="title">{t("dashboard.sortAZ")}</option>
                </select>
                <select className={styles.select} data-on={pFilter !== "All" ? "true" : undefined} value={pFilter} onChange={(e) => { setPFilter(e.target.value); setPPage(0); }} aria-label={t("dashboard.collabFilterProjects")}>
                  <option value="All">{t("dashboard.collabAllStatuses")}</option>
                  <option value="Stuck">{t("dashboard.collabStuckOnSomeone")}</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{wordText(t, s)}</option>)}
                </select>
              </div>
            )}
            {st && (
              <div key={st.id} className={styles.detail}>
                <div className={styles.eyebrow}>{t("dashboard.collabSelectedProject")}</div>
                <div className={styles.detailTitle}>{st.name}</div>
                <div className={`${ui.chips} ${styles.selMeta}`}>
                  <Pill tone={statusTone(st.status)}>{wordText(t, st.status)}</Pill>
                  <span className={ui.small}>{st.stage}</span>
                  {st.depts.map((d) => <DeptChip key={d} name={deptName(d)} />)}
                </div>
                <div className={`${ui.body} ${styles.why}`}>{t("dashboard.collabStartedBecause", { why: st.why })}</div>
                {stuck && (
                  <div className={styles.stuck} onClick={() => pickPerson(stuck.name)}>
                    <PersonFace name={stuck.name} size="sm" />
                    <span><b>{t("dashboard.collabStuckAt", { name: stuck.name })}</b> - {stuck.reason}</span>
                  </div>
                )}
                <div className={styles.go}>
                  {projectMode ? (
                    <Link href={href("/projects/" + st.id)} className={styles.goBtn}>{t("dashboard.collabOpenProject")}</Link>
                  ) : st.idea ? (
                    <Link href={href("/ideas?id=" + st.idea)} className={styles.goBtn}>{t("dashboard.collabOpenIdeas")}</Link>
                  ) : st.status === "Shipped" ? (
                    <Link href={href("/projects/progress")} className={styles.goBtn}>{t("dashboard.collabSeeOutcome")}</Link>
                  ) : (
                    <span className={styles.goNone}>{t("dashboard.collabNoIdeaPage")}</span>
                  )}
                  <button type="button" className={ui.textlink} onClick={() => setSel({ kind: "none" })}>{t("common.close")}</button>
                </div>
              </div>
            )}
            <div className={styles.listBox}>
              {emptyProjects && <Empty title={t("dashboard.collabNothingYet")} sub={t("dashboard.collabFirstCase")} />}
              {!emptyProjects && pSorted.length === 0 && <div className={ui.emptyLine}>{t("dashboard.collabNoProjectMatches")}</div>}
              {pRows.length > 0 && (
                <DataTable
                  testId="collab-projects"
                  rows={pRows}
                  rowKey={(row) => row.id}
                  empty=""
                  columns={[
                    {
                      key: "name", header: t("progress.collabColProject"), render: (row) => {
                        const mine = sp ? row.members.some((m) => m.name === sp.name) || row.stuckOn?.name === sp.name : false;
                        return (
                          <>
                            <button type="button" className={styles.pick} data-active={st?.id === row.id || mine ? "true" : undefined} onClick={() => pickProject(row.id)}>{row.name}</button>
                            <div className={styles.rowMeta}>
                              {row.depts.map((d) => <DeptChip key={d} name={deptName(d)} />)}
                              <span>{row.people ? t("dashboard.collabNPeople", { n: row.people }) : t("dashboard.collabNobodyAssigned")}{row.stuckOn ? " · " + t("dashboard.collabStuckAtLc", { name: row.stuckOn.name }) : ""}</span>
                            </div>
                          </>
                        );
                      },
                    },
                    { key: "status", header: t("progress.collabColStatus"), width: "max-content", render: (row) => <Pill tone={statusTone(row.status)}>{wordText(t, row.status)}</Pill> },
                  ]}
                  paging={paging(pCur, pPages, pSorted.length ? pCur * pSize + 1 : 0, Math.min(pSorted.length, (pCur + 1) * pSize), pSorted.length, setPPage)}
                />
              )}
            </div>
           </SectionCard>
          </div>

          <div className={styles.win} data-expanded={sp ? "true" : undefined}>
           <SectionCard name="people">
            <div className={ui.between}>
              <div className={styles.h}>{sp ? t("dashboard.collabPerson") : t("dashboard.collabPeople")}</div>
              {(st || sp) && (
                <div className={styles.seg} role="group" aria-label={t("dashboard.collabWhichPeople")}>
                  <button type="button" className={styles.segBtn} data-on={scope === "linked" ? "true" : undefined} onClick={() => { setHScope("linked"); setHPage(0); }}>{st ? t("dashboard.collabOnItBtn") : t("dashboard.collabWorksWithBtn")}</button>
                  <button type="button" className={styles.segBtn} data-on={scope === "all" ? "true" : undefined} onClick={() => { setHScope("all"); setHPage(0); }}>{t("dashboard.collabEveryone")}</button>
                </div>
              )}
            </div>
            {D.people.length > 0 && (
              <div className={styles.tools}>
                <input className={styles.search} type="search" placeholder={t("dashboard.collabSearchPeople")} value={hq} onChange={(e) => { setHq(e.target.value); setHPage(0); }} aria-label={t("dashboard.collabSearchPeople")} />
                <select className={styles.select} value={hSort} onChange={(e) => { setHSort(e.target.value as PersonSort); setHPage(0); }} aria-label={t("dashboard.collabSortPeopleLabel")}>
                  <option value="name">{t("dashboard.sortAZ")}</option>
                  <option value="dept">{t("dashboard.collabSortDept")}</option>
                  <option value="role">{t("dashboard.collabSortRole")}</option>
                </select>
                <select className={styles.select} data-on={hDept !== "All" ? "true" : undefined} value={hDept} onChange={(e) => { setHDept(e.target.value); setHPage(0); }} aria-label={t("dashboard.collabFilterPeopleDept")}>
                  <option value="All">{t("dashboard.collabAllDepartments")}</option>
                  {deptsInList.map((d) => <option key={d} value={d}>{deptName(d)}</option>)}
                </select>
              </div>
            )}

            {sp && (
              <div key={sp.name} className={styles.detail}>
                <div className={styles.who}>
                  <PersonFace name={sp.name} />
                  <div>
                    <div className={styles.detailTitle}>{sp.name}</div>
                    <div className={styles.rowMeta}>{sp.role}{sp.dept ? <> · <DeptChip name={deptName(sp.dept)} /></> : ""}</div>
                  </div>
                </div>
                <div className={`${ui.note} ${ui.mt8}`}>
                  {sp.reportsTo ? <>{t("dashboard.collabReportsTo")} <button type="button" className={ui.textlink} onClick={() => pickPerson(sp.reportsTo ?? "")}>{sp.reportsTo}</button>. </> : sp.dept ? t("dashboard.collabTopOfCompany") + " " : ""}
                  {reportsCount ? t("dashboard.collabReports", { count: reportsCount }) + " " : ""}
                  {spProjects.length ? t("dashboard.collabOnNames", { names: spProjects.map((p) => p.name).join(", ") }) : t("dashboard.collabNotOnCross")}
                </div>
                {stuckHere.map((pr) => (
                  <div key={pr.id} className={styles.stuck} onClick={() => pickProject(pr.id)}>
                    <span><b>{pr.name}</b> {t("dashboard.collabIsWaitingOnThem")} {pr.stuckOn?.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.listBox}>
              {D.people.length === 0 && !st && <div className={ui.emptyLine}>{t("dashboard.collabPeopleAppear")}</div>}
              {hBase.length > 0 && hSorted.length === 0 && <div className={ui.emptyLine}>{t("dashboard.collabNobodyMatches")}</div>}
              {hBase.length === 0 && (st || sp) && <div className={ui.emptyLine}>{st ? t("dashboard.collabNobodyAssignedYet") : t("dashboard.collabWorksWithNobody")}</div>}
              {hRows.length > 0 && (
                <DataTable
                  testId="collab-people"
                  rows={hRows}
                  rowKey={(r) => r.name + r.role}
                  empty=""
                  columns={[
                    {
                      key: "name", header: t("progress.collabColPerson"), render: (r) => {
                        const label = r.name === "—" ? t("dashboard.listNobodyAssigned") : r.name;
                        return (
                          <span className={styles.personCell}>
                            <PersonFace name={r.name} size="sm" />
                            {r.click
                              ? <button type="button" className={styles.pick} data-active={sp?.name === r.name ? "true" : undefined} onClick={() => pickPerson(r.name)}>{label}</button>
                              : <span className={styles.memberName}>{label}</span>}
                          </span>
                        );
                      },
                    },
                    { key: "right", header: t("progress.collabColAbout"), width: "minmax(0, 0.8fr)", render: (r) => <span className={styles.memberRole}>{r.right}</span> },
                  ]}
                  paging={paging(hCur, hPages, hSorted.length ? hCur * hSize + 1 : 0, Math.min(hSorted.length, (hCur + 1) * hSize), hSorted.length, setHPage)}
                />
              )}
            </div>
           </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
