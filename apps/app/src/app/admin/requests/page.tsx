// Pilot requests: the list on the left, the selected one's panel on the right. The selection,
// the filter and the search are all in the URL (?id=, ?view=, ?q=), so a request is a link.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { filterRequests, isRequestView, REQUEST_VIEWS, type RequestView } from "@/features/admin/requests";
import { RequestList, requestHref } from "@/components/admin/RequestList";
import { RequestPanel } from "@/components/admin/RequestPanel";
import styles from "../admin.module.css";

const VIEW_LABEL: Record<RequestView, string> = { open: "Open", replied: "Replied", all: "All" };

type Search = { id?: string; view?: string; q?: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const base = adminBase();
  const sp = await searchParams;

  const view: RequestView = isRequestView(sp.view) ? sp.view : "open";
  const q = (sp.q ?? "").trim();
  const needle = q.toLowerCase();
  const matches = (r: (typeof ctx.requests)[number]) =>
    !needle ||
    [r.company, r.name, r.email, r.decision, r.message, r.notes].some((f) => f.toLowerCase().includes(needle));

  const searched = ctx.requests.filter(matches);
  const shown = filterRequests(searched, view);
  const counts = Object.fromEntries(REQUEST_VIEWS.map((v) => [v, filterRequests(searched, v).length])) as Record<RequestView, number>;
  const selected = sp.id ? (ctx.requests.find((r) => r.id === sp.id) ?? null) : null;

  const companiesHref = selected
    ? `${base}/companies?${new URLSearchParams({ from: selected.id }).toString()}#new`
    : `${base}/companies`;

  return (
    <div className={styles.split} data-open={selected ? "" : undefined}>
      <section className={`${styles.card} ${styles.listCol}`}>
        <h1>Pilot requests</h1>
        <p className="nh-hint">
          {ctx.requests.length === 0
            ? "None yet. Every real submit of the /contact form lands here."
            : ctx.open.length === 0
              ? `All ${ctx.requests.length} replied to.`
              : `${ctx.open.length} waiting for a reply${ctx.overdue.length ? `, ${ctx.overdue.length} past the two-working-day promise` : ""} - it applies to us too.`}
        </p>

        <form className={styles.search} role="search" action={`${base}/requests`}>
          {view !== "open" ? <input type="hidden" name="view" value={view} /> : null}
          <input className="nh-input" type="search" name="q" defaultValue={q} placeholder="Search company, name, e-mail, notes" aria-label="Search requests" />
        </form>

        <nav className={styles.tabs} aria-label="Filter">
          {REQUEST_VIEWS.map((v) => (
            <a key={v} href={requestHref(base, null, v, q)} aria-current={v === view ? "page" : undefined}>
              {VIEW_LABEL[v]} <span className={styles.navBadge}>{counts[v]}</span>
            </a>
          ))}
        </nav>

        {shown.length === 0 ? (
          <p className="nh-hint">
            {q ? `Nothing matches "${q}".` : view === "open" ? "Nothing open - all caught up." : "Nothing here."}
          </p>
        ) : (
          <RequestList requests={shown} base={base} view={view} q={q} selectedId={selected?.id ?? null} />
        )}
      </section>

      <div className={styles.panelCol}>
        {selected ? (
          <RequestPanel
            key={selected.id}
            request={selected}
            readOnly={!ctx.live}
            canSend={ctx.mailState === "up"}
            mailTarget={ctx.mail.target}
            companiesHref={companiesHref}
            closeHref={requestHref(base, null, view, q)}
          />
        ) : (
          <div className={`${styles.card} ${styles.panelEmpty}`}>
            {sp.id ? (
              <p>That request is not here any more - it was deleted, or the link is from another database.</p>
            ) : (
              <p>Pick a request to read it, answer it, edit it or delete it.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
