// What every page shows before its content: grey boxes in the shape of the view. Used twice -
// by Next's loading.tsx while the route streams in, and by each view while it waits for `ready`
// (the browser's persisted state), so a page never sits empty or half-rendered.
//
// No data, no context: this has to render outside DemoProvider (src/app/[company]/loading.tsx).
import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./PageSkeleton.module.css";

export type SkeletonKind = "list" | "overview" | "inbox" | "raise" | "dashboard" | "detail" | "settings";

/** The view family for an app path (relative to /[company]) - what loading.tsx outside the shell uses. */
export function skeletonKindFor(appPath: string): SkeletonKind {
  const p = appPath === "/" ? "/raise" : appPath;
  if (p.startsWith("/manager")) return "overview";
  if (p.startsWith("/leader")) return "inbox";
  if (p.startsWith("/raise")) return "raise";
  if (p.startsWith("/dashboard")) return "dashboard";
  if (p.startsWith("/cases/")) return "detail";
  if (p.startsWith("/settings")) return "settings";
  return "list";
}

const APP_ROUTES = new Set(["manager", "leader", "raise", "dashboard", "cases", "settings", "problems", "ideas", "collaboration", "progress", "team"]);

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

// `delay`: stay invisible for the first 400ms, so a fast device never sees the skeleton flash.
// The views pass it (they wait for hydration); loading.tsx does not - on navigation the old page
// is already gone, so a delayed skeleton would only mean a blank. CSS-only, so it runs pre-hydration.
export function PageSkeleton({ kind = "list", delay = false }: { kind?: SkeletonKind; delay?: boolean }) {
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
      <span className={styles.sr}>Loading…</span>
      {body}
    </div>
  );
}

const n = (count: number) => Array.from({ length: count }, (_, i) => i);

function Head({ tools = 0 }: { tools?: number }) {
  return (
    <div className={styles.head}>
      <div className={styles.headText}>
        <Skeleton w={220} h={24} />
        <Skeleton w={340} h={12} />
      </div>
      {tools > 0 && <div className={styles.tools}>{n(tools).map((i) => <Skeleton key={i} w={i === 0 ? 96 : 72} h={32} r="md" />)}</div>}
    </div>
  );
}

function Stats({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.stats}>
      {n(count).map((i) => (
        <div key={i} className={styles.stat}>
          <Skeleton w={44} h={20} />
          <Skeleton w="72%" h={11} />
        </div>
      ))}
    </div>
  );
}

function Rows({ count, avatar }: { count: number; avatar?: boolean }) {
  return n(count).map((i) => (
    <div key={i} className={styles.row}>
      {avatar && <Skeleton w={28} h={28} r="circle" />}
      <div className={styles.rowBody}>
        <Skeleton w={`${52 + ((i * 17) % 30)}%`} h={14} />
        <Skeleton w={`${30 + ((i * 11) % 22)}%`} h={11} />
      </div>
      <Skeleton w={56} h={20} r="pill" />
    </div>
  ));
}

function Card({ rows, title = true, avatar }: { rows: number; title?: boolean; avatar?: boolean }) {
  return (
    <div className={styles.card}>
      {title && (
        <div className={styles.cardTitle}>
          <Skeleton w={140} h={15} />
          <Skeleton w={64} h={12} />
        </div>
      )}
      <Rows count={rows} avatar={avatar} />
    </div>
  );
}

// Problems, ideas, collaboration, progress, team: head + four numbers + one long list.
function List() {
  return (
    <>
      <Head tools={2} />
      <Stats />
      <Card rows={6} title={false} />
    </>
  );
}

// Manager: the blue "waiting on you" panel, the KPIs, then two cards side by side.
function Overview() {
  return (
    <>
      <Head />
      <div className={`${styles.card} ${styles.brand}`}>
        <div className={styles.cardTitle}>
          <Skeleton w={130} h={15} dark />
          <Skeleton w={70} h={12} dark />
        </div>
        <div className={styles.tiles}>
          {n(3).map((i) => (
            <div key={i} className={styles.tile}>
              <Skeleton w="78%" h={14} />
              <Skeleton w="45%" h={11} />
              <Skeleton w={90} h={26} r="pill" />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.kpis}>
        {n(4).map((i) => (
          <div key={i} className={styles.kpi}>
            <Skeleton w="55%" h={11} />
            <Skeleton w={72} h={24} />
            <Skeleton w="70%" h={11} />
          </div>
        ))}
      </div>
      <div className={styles.split}>
        <Card rows={5} />
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Skeleton w={120} h={15} />
          </div>
          <div className={styles.bars}>
            {n(4).map((i) => (
              <div key={i} className={styles.bar}>
                <Skeleton w={110} h={12} />
                <Skeleton w={`${70 - i * 14}%`} h={10} r="pill" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// Team leader: numbers, then the list on the left and the selected case on the right.
function Inbox() {
  return (
    <>
      <Head />
      <Stats />
      <div className={`${styles.split} ${styles.wide}`}>
        <Card rows={6} avatar />
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Skeleton w={64} h={20} r="pill" />
            <Skeleton w={56} h={12} />
          </div>
          <div className={styles.fields}>
            <Skeleton w="85%" h={18} />
            <Skeleton w="100%" h={12} />
            <Skeleton w="92%" h={12} />
            <Skeleton w="60%" h={12} />
            <div className={styles.chips}>
              <Skeleton w={84} h={36} r="md" />
              <Skeleton w={84} h={36} r="md" />
              <Skeleton w={100} h={36} r="md" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Team member: one title and one box.
// Raise (RaiseView): the greeting, the box (idea/problem switch + one line, Attach/Affected + send)
// and the "How NextUp works" card with its four steps.
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
      <div className={styles.raiseCard}>
        <div className={styles.raiseCardHead}>
          <Skeleton w={170} h={20} />
          <Skeleton w={150} h={11} />
        </div>
        <div className={styles.raiseHow}>
          {n(4).map((i) => (
            <div key={i} className={styles.raiseStep}>
              <Skeleton w="100%" h={78} r="md" />
              <Skeleton w="60%" h={16} />
              <Skeleton w="90%" h={11} />
              <Skeleton w="70%" h={11} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Dashboard: a big title, the filter pills, one list of cases.
function Dashboard() {
  return (
    <>
      <Skeleton w={200} h={30} />
      <div className={styles.chips}>
        {n(4).map((i) => <Skeleton key={i} w={i === 0 ? 56 : 84} h={30} r="pill" />)}
      </div>
      <div className={styles.list}>
        <Rows count={7} avatar />
      </div>
    </>
  );
}

// One case: the story on the left, the timeline on the right.
function Detail() {
  return (
    <>
      <Skeleton w={64} h={13} />
      <div className={styles.headText}>
        <Skeleton w="60%" h={26} />
        <Skeleton w={220} h={12} />
      </div>
      <div className={`${styles.split} ${styles.wide}`}>
        <div className={styles.card}>
          <div className={styles.fields}>
            <Skeleton w="100%" h={13} />
            <Skeleton w="96%" h={13} />
            <Skeleton w="88%" h={13} />
            <Skeleton w="40%" h={13} />
            <div className={styles.chips}>
              <Skeleton w={110} h={36} r="md" />
              <Skeleton w={110} h={36} r="md" />
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Skeleton w={90} h={15} />
          </div>
          <Rows count={4} avatar />
        </div>
      </div>
    </>
  );
}

// Settings: a form.
function Settings() {
  return (
    <>
      <Head />
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
