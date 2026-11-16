"use client";
// What every page shows before its content: grey boxes in the shape of the view, as quiet as the view (DESIGN_RULES §9). Used twice -
// by Next's loading.tsx while the route streams in, and by each view while it waits for `ready`
// (the browser's persisted state), so a page never sits empty or half-rendered.
//
// No data, no context: this has to render outside DemoProvider (src/app/[company]/loading.tsx).
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/client";
import styles from "./PageSkeleton.module.css";

export type SkeletonKind = "list" | "overview" | "inbox" | "raise" | "dashboard" | "detail" | "settings";

/** The view family for an app path (relative to /[company]) - what loading.tsx outside the shell uses. */
export function skeletonKindFor(appPath: string): SkeletonKind {
  const p = appPath === "/" ? "/raise" : appPath;
  if (p.startsWith("/dashboard") || p.startsWith("/manager")) return "overview"; // the Dashboard (the manager home)
  if (p.startsWith("/leader") || p === "/inbox") return "inbox";
  if (p.startsWith("/raise")) return "raise";
  if (p.startsWith("/overview") || p === "/feed") return "dashboard"; // the Feed, the Overview table
  if (p.startsWith("/cases/") || p === "/idea") return "detail"; // an idea's one page
  if (p.startsWith("/settings")) return "settings";
  return "list";
}

const APP_ROUTES = new Set(["manager", "leader", "raise", "dashboard", "overview", "cases", "settings", "problems", "idea", "ideas", "collaboration", "progress", "team", "inbox", "feed", "projects", "decisions", "profile", "reports", "people"]);

/**
 * Same, from the browser's pathname, which is /acme/leader in path mode and /leader in subdomain
 * mode (the proxy rewrites the slug in; usePathname never sees it). A first segment that is an
 * app route means there is no slug to skip.
 */
export function skeletonKindForPathname(pathname: string): SkeletonKind {
  const segs = pathname.split("/").filter(Boolean);
  const app = APP_ROUTES.has(segs[0]) ? segs : segs.slice(1);
  return skeletonKindFor("/" + app.join("/"));
}

// `delay`: stay invisible for the first 400ms, so a fast answer never flashes the skeleton. Only for
// waits that start on an already drawn page (a fetch, a Suspense inside the view). Not for a view
// waiting for hydration: on a page load it replaces the skeleton loading.tsx was already showing, so
// a delay there blanks the page for 400ms and the boxes come back - the page seems to load twice.
// CSS-only, so it runs pre-hydration.
export function PageSkeleton({ kind: asked = "list", delay = false }: { kind?: SkeletonKind; delay?: boolean }) {
  const t = useT();
  // A view that waits for its data asks for a general shape ("list", "dashboard"). Where the address says more - the
  // Dashboard's tiles, an idea's page - the skeleton follows the address, so it has the shape loading.tsx just showed.
  const here = skeletonKindForPathname(usePathname() ?? "");
  const kind = (asked === "list" || asked === "dashboard") && (here === "overview" || here === "detail") ? here : asked;
  const body =
    kind === "overview" ? <Overview /> :
    kind === "inbox" ? <Inbox /> :
    kind === "raise" ? <Raise /> :
    kind === "dashboard" ? <Dashboard /> :
    kind === "detail" ? <Detail /> :
    kind === "settings" ? <Settings /> :
    <List />;
  return (
    <div className={kind === "raise" ? styles.raise : styles.page} data-delay={delay || undefined} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.sr}>{t("common.loading")}</span>
      {body}
    </div>
  );
}

const n = (count: number) => Array.from({ length: count }, (_, i) => i);

/** Rows of a list: a title, one fact under it, and a chip on some. */
function Rows({ count, avatar, chips = 1 }: { count: number; avatar?: boolean; chips?: number }) {
  return n(count).map((i) => (
    <div key={i} className={styles.row}>
      {avatar && <Skeleton w={28} h={28} r="circle" />}
      <div className={styles.rowBody}>
        <Skeleton w={`${52 + ((i * 17) % 30)}%`} h={14} />
        <Skeleton w={`${18 + ((i * 11) % 14)}%`} h={11} />
      </div>
      {i < chips && <Skeleton w={56} h={20} r="pill" />}
    </div>
  ));
}

function Card({ rows, title = true, avatar, chips }: { rows: number; title?: boolean; avatar?: boolean; chips?: number }) {
  return (
    <div className={styles.card}>
      {title && (
        <div className={styles.cardTitle}>
          <Skeleton w={120} h={15} />
          <Skeleton w={16} h={12} />
        </div>
      )}
      <Rows count={rows} avatar={avatar} chips={chips} />
    </div>
  );
}

/** Lines that open (Fold): a name on the left, one short fact on the right. */
function Lines({ count }: { count: number }) {
  return (
    <div className={styles.card}>
      {n(count).map((i) => (
        <div key={i} className={styles.line}>
          <Skeleton w={90 + ((i * 23) % 60)} h={14} />
          <Skeleton w={64} h={11} />
        </div>
      ))}
    </div>
  );
}

// The quiet pages (DESIGN_RULES §9) draw no page title and no strip of numbers, so neither does their skeleton.

// Projects, a project, Collaboration, Progress, Mine: one row of filters and one card of rows.
function List() {
  return (
    <>
      <div className={styles.chips}>
        <Skeleton w={56} h={30} r="pill" />
        <Skeleton w={92} h={30} r="pill" />
      </div>
      <Card rows={5} title={false} chips={2} />
    </>
  );
}

// The Dashboard: one row of controls, the tiles, then the lines that open.
function Overview() {
  return (
    <>
      <div className={styles.chips}>
        <Skeleton w={84} h={30} r="pill" />
        <Skeleton w={104} h={30} r="pill" />
        <Skeleton w={88} h={30} r="pill" />
      </div>
      <div className={styles.tiles}>
        {n(5).map((i) => (
          <div key={i} className={styles.tile}>
            <Skeleton w="70%" h={12} />
            <Skeleton w={64} h={26} />
          </div>
        ))}
      </div>
      <Lines count={2} />
    </>
  );
}

// The inbox: one card per ask, each row a title and one fact.
function Inbox() {
  return (
    <>
      <Card rows={4} chips={2} />
      <Card rows={1} chips={0} />
    </>
  );
}

// Team member: one title and one box.
// Raise (RaiseView): the greeting and the box (idea/problem switch + one line, Attach/Affected + send).
function Raise() {
  return (
    <>
      <Skeleton w={360} h={42} r="md" className={styles.raiseTitle} />
      <div className={styles.raiseBox}>
        <div className={styles.raiseLine}>
          <Skeleton w={58} h={30} r="pill" />
          <Skeleton w="55%" h={16} />
        </div>
        <div className={styles.raiseFoot}>
          <div className={styles.chips}>
            <Skeleton w={78} h={32} r="pill" />
            <Skeleton w={92} h={32} r="pill" />
          </div>
          <Skeleton w={36} h={36} r="circle" />
        </div>
      </div>
    </>
  );
}

// The Feed and the lists behind it: the filter pills, one list.
function Dashboard() {
  return (
    <>
      <div className={styles.chips}>
        {n(4).map((i) => <Skeleton key={i} w={i === 0 ? 56 : 84} h={30} r="pill" />)}
      </div>
      <div className={styles.list}>
        <Rows count={6} avatar chips={2} />
      </div>
    </>
  );
}

// One idea: who, the title, the text and the lines that open; beside it the viewer's move.
function Detail() {
  return (
    <div className={`${styles.split} ${styles.wide}`}>
      <div className={styles.card}>
        <div className={styles.fields}>
          <div className={styles.who}>
            <Skeleton w={28} h={28} r="circle" />
            <Skeleton w={150} h={12} />
          </div>
          <Skeleton w="70%" h={24} />
          <Skeleton w="96%" h={13} />
          <Skeleton w="62%" h={13} />
        </div>
        {n(3).map((i) => (
          <div key={i} className={styles.line}>
            <Skeleton w={80 + ((i * 29) % 50)} h={14} />
          </div>
        ))}
      </div>
      <div className={styles.card}>
        <div className={styles.fields}>
          <Skeleton w={90} h={15} />
          <Skeleton w="100%" h={36} r="md" />
          <div className={styles.pair}>
            <Skeleton w="100%" h={32} r="md" />
            <Skeleton w="100%" h={32} r="md" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings: a title and a form.
function Settings() {
  return (
    <>
      <div className={styles.headText}>
        <Skeleton w={220} h={24} />
        <Skeleton w={340} h={12} />
      </div>
      <div className={styles.card}>
        <div className={styles.fields}>
          {n(4).map((i) => (
            <div key={i} className={styles.field}>
              <Skeleton w={120} h={12} />
              <Skeleton w="100%" h={40} r="md" />
            </div>
          ))}
          <Skeleton w={120} h={38} r="md" />
        </div>
      </div>
    </>
  );
}
