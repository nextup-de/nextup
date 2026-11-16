"use client";
// The Feed: the Claude Design handoff "Idea Feed", its markup and classes 1:1 (dc-convert ->
// Feed.module.css). Closed, a grid of cards - a cover with the case's key number, the title, who
// backs it - filtered by site and department and sorted by support or age. A card opens the idea page
// (/cases/<id>), the one home of an idea; ?id= goes there straight away.
// Facts: the cases this viewer may see (derive.visibleTo), "this affects me too" as Support
// (act.affect), comments (act.comment). Covers come from a fixed library (features/cases/thumbs.ts).
// Each card shows the case's latest event (features/cases/feed.ts latestActivity); nothing here is a stand-in.
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useCaseNames } from "@/components/cases/useCaseNames";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen, visibleTo } from "@/components/dashboard/derive";
import { DeptChip, PersonFace, ShowAll, useCapped } from "@/components/ui/elements";
import { deptTone } from "@/lib/dept-tone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { archiveOf, inView, type ListView } from "@/features/cases/discussion";
import { deptChips, FEED_SORT_KEY, FEED_SORTS, feedCover, feedStage, inDept, inSite, inUnit, latestActivity, siteFilters, sortFeed, isMe as isBacker, supportSummary, unitFilters, type Activity, type Backer, type FeedSort } from "@/features/cases/feed";
import type { ReducedCase } from "@/features/cases/reducer";
import { dashboardRow, raisedWith } from "@/features/cases/rows";
import { affectedOn, commentsOn } from "@/features/cases/selectors";
import { profileOf } from "@/features/demo/profiles";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n";
import s from "./Feed.module.css";
import { libraryCoverFor, sampleCoverFor } from "@/features/cases/thumbs";

const ALL_SITES = "*"; // the "every site" filter value; shown as feedAllSites
const ALL_UNITS = "*"; // the "every unit" filter value; shown as feed.allUnits
const isHandle = (name: string) => name.startsWith("Anonymous");
// A count beside a label: nothing at 0 (lib/utils/quiet.ts).
const quietCount = (n: number, className: string) => (n > 0 ? <span className={className}>{n}</span> : null);
const ago = (t: T, days: number) => (days <= 0 ? t("common.today") : days === 1 ? t("common.yesterday") : t("team.feedDaysAgo", { count: days }));

function UpArrow({ size, w }: { size: number; w: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
}
function Check({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
// One case as the Feed needs it: facts from the log, nothing invented.
type Item = {
  c: ReducedCase; mine: boolean; backing: Backer[]; supported: boolean; tags: string[];
  site: string | null; raisedDay: number; lastDay: number; activity: Activity | null; backers: number; comments: number; own: boolean;
};

export function FeedView({ initialId }: { initialId?: string } = {}) {
  const t = useT();
  const names = useCaseNames();
  const ctx = useDemo();
  const { seed, tenant, D, log, ready, act, actor, me, flag, href } = ctx; // actor is the label I post under: shown, never compared
  const [view, setView] = useState<ListView>("open");
  const [dept, setDept] = useState("All");
  const [site, setSite] = useState(ALL_SITES);
  const [unit, setUnit] = useState(ALL_UNITS);
  const [sort, setSort] = useState<FeedSort>("relevant");
  const [menu, setMenu] = useState<"dept" | "site" | "unit" | "sort" | null>(null);
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  const P = seed.promiseDays;
  const deptNames = seed.depts.map((d) => d.name);
  const personOf = (name: string) => seed.people.find((p) => p.name === name);
  const deptNameOf = (name: string) => { const id = personOf(name)?.dept; return seed.depts.find((d) => d.id === id)?.name ?? ""; };
  const unitIdOf = (c: ReducedCase) => seed.depts.find((d) => d.name === c.fromDept)?.id ?? null;
  const siteOf = (name: string) => (isHandle(name) ? null : profileOf(name).location);

  const myDept = deptNameOf(ctx.persona.who.name); // the reader's own unit: its ideas weigh a little more (feedRelevance)
  const itemOf = (c: ReducedCase): Item => {
    const row = dashboardRow(c, P, me, log);
    const activity = latestActivity(c.id, log, seed.seats, tenant.actorLabels);
    // Who backs it: named when raised (no id), plus everyone who pressed "this affects me too" (their user id).
    const named = raisedWith(c).affected;
    const backing: Backer[] = [...named.map((name) => ({ userId: null, name })), ...affectedOn(log, c.id).filter((a) => !named.includes(a.name)).map((a) => ({ userId: a.userId, name: a.name }))]
      .filter((b) => !deptNames.includes(b.name));
    const routeDept = c.route ? seed.depts.find((d) => d.id === c.route?.owner.dept)?.name ?? null : null;
    const tags = [...new Set([c.fromDept, ...(routeDept ? [routeDept] : []), ...row.affected.filter((n) => deptNames.includes(n))])];
    return {
      c, mine: row.mine, backing, supported: backing.some((b) => isBacker(b, me)), tags,
      site: siteOf(c.from), raisedDay: c.raisedDay, lastDay: activity?.day ?? c.raisedDay, activity, backers: backing.length, comments: commentsOn(log, c.id).filter((m) => !m.rescore).length, own: !!myDept && tags.includes(myDept),
    };
  };
  // With projects on, the feed shows what is still moving; what was decided sits in the Archive.
  const split = flag("projects");
  const everything = D.cases.filter((c) => visibleTo(ctx, c)).map(itemOf);
  const visible = split ? everything.filter((x) => inView(archiveOf(x.c), view)) : everything;
  const otherView: ListView = view === "open" ? "archive" : "open";
  const sites = siteFilters(seed), units = site === ALL_SITES ? [] : unitFilters(seed, site);
  const inSites = (x: Item, id: string) => id === ALL_SITES || inSite(seed, unitIdOf(x.c), id);
  const bySite = visible.filter((x) => inSites(x, site) && (unit === ALL_UNITS || inUnit(unitIdOf(x.c), unit)));
  const list = sortFeed(bySite.filter((x) => inDept(x.tags, dept)), sort, log.day);
  const cards = useCapped(list, [view, dept, site, unit, sort].join("|"));
  const siteName = sites.find((x) => x.id === site)?.name ?? t("team.feedAllSites");
  const unitName = units.find((x) => x.id === unit)?.name ?? t("feed.allUnits");
  const deptCount = (d: string) => bySite.filter((x) => x.tags.includes(d)).length;
  const { chips: deptChipNames, more: moreDepts } = deptChips(seed, deptCount, dept); // at most three, the rest in a menu
  const chips = ["All", ...deptChipNames];

  const open = (id: string) => router.push(href("/cases/" + encodeURIComponent(id)));
  const support = (x: Item) => { act.affect(x.c.id); };
  // The latest-event line: what last happened, by whom (their desk role, else the event's label), and when.
  const latestLine = (c: ReducedCase, a: Activity | null): string => {
    const when = ago(t, log.day - (a?.day ?? c.raisedDay));
    if (!a || a.kind === "raised") return t("feed.latestRaised", { when });
    const who = (a.role ? names.roleTitle(a.role) : "") || a.label || t("feed.theDesk");
    const key = { read: "feed.latestRead", asked: "feed.latestAsked", yes: "feed.latestYes", no: "feed.latestNo", handed: "feed.latestHanded", discussion: "feed.latestDiscussion", escalated: "feed.latestEscalated" } as const;
    return t(key[a.kind], { who, when });
  };
  // The card's supporters line: a unit is named only with at least MIN_GROUP supporters from it.
  const supportersLine = (x: Item): string => {
    const sum = supportSummary(x.backing.map((b) => ({ ...b, unit: deptNameOf(b.name) || null })), me);
    return sum.kind === "none" ? t("feed.supportersNone") : sum.kind === "you" ? t("feed.supportersYou")
      : sum.kind === "unit" ? t("feed.supportersUnit", { count: sum.count, unit: sum.unit }) : t("feed.supportersCount", { count: sum.count });
  };
  // Supporter avatars: up to three, you first once you back it.
  const avatars = (x: Item) => (x.supported ? [{ name: actor, me: true }, ...x.backing.filter((b) => !isBacker(b, me)).map((b) => ({ name: b.name, me: false }))] : x.backing.map((b) => ({ name: b.name, me: false }))).slice(0, 3);

  // An old address with ?id= (a notice, a shared link) goes on to the idea page, when the viewer may open that case.
  const forward = ready && initialId ? D.cases.find((k) => k.id === initialId && canOpen(ctx, k))?.id ?? null : null;
  useEffect(() => { if (forward) router.replace(href("/cases/" + encodeURIComponent(forward))); }, [forward, router, href]);

  // Escape closes the open menu.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape" && menu) setMenu(null);
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!ready || forward) return <PageSkeleton kind="dashboard" />;

  return (
    <div className={s.root} ref={rootRef}>
      <div className={s.div3}>
        {/* One row: the department chips are the filter that shows; site, sort and the archive sit quietly on the right. */}
        <h1 className="nh-sr">{t("team.feedTitle")}</h1>
        <div className={s.div4}>
          <div className={s.chips}>
            {chips.map((d) => (
              <button key={d} type="button" className={s.pick2} data-dept-tone={d === "All" ? undefined : deptTone(d)} data-on={dept === d ? "true" : undefined} aria-pressed={dept === d} onClick={() => setDept(d)}>
                {d === "All" ? t("team.feedAll") : d}{quietCount(d === "All" ? bySite.length : deptCount(d), s.count2)}
              </button>
            ))}
            {moreDepts.length > 0 && (
              <div className={s.div6}>
                <button type="button" className={s.more} aria-expanded={menu === "dept"} aria-haspopup="menu" onClick={() => setMenu(menu === "dept" ? null : "dept")}>
                  {t("feed.moreDepts")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {menu === "dept" && (
                  <div className={s.div7} data-first="true" role="menu">
                    {moreDepts.map((d) => (
                      <button key={d} type="button" role="menuitemradio" aria-checked={dept === d} className={s.pick} data-empty={deptCount(d) === 0 ? "true" : undefined} onClick={() => { setDept(d); setMenu(null); }}>
                        <span className={s.label}>{d}</span>
                        <span className={s.count}>{deptCount(d)}</span>
                        <span className={s.check} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={s.div5}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(null)} aria-hidden="true" />}
            <div className={s.div6}>
              <button type="button" className={s.toggleSite} onClick={() => setMenu(menu === "site" ? null : "site")} aria-expanded={menu === "site"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {siteName}
              </button>
              {menu === "site" && (
                <div className={s.div7} data-first="true" role="menu">
                  {[{ id: ALL_SITES, name: t("team.feedAllSites") }, ...sites].map((x) => (
                    <button key={x.id} type="button" role="menuitemradio" aria-checked={site === x.id} className={s.pick} data-on={site === x.id ? "true" : undefined} onClick={() => { setSite(x.id); setUnit(ALL_UNITS); setMenu(null); }}>
                      <span className={s.label}>{x.name}</span>
                      {quietCount(visible.filter((v) => inSites(v, x.id)).length, s.count)}
                      <span className={s.check}>{site === x.id ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {units.length > 0 && (
              <div className={s.div6}>
                <button type="button" className={s.toggleSite} onClick={() => setMenu(menu === "unit" ? null : "unit")} aria-expanded={menu === "unit"} aria-haspopup="menu">
                  {unitName}
                </button>
                {menu === "unit" && (
                  <div className={s.div7} role="menu">
                    {[{ id: ALL_UNITS, name: t("feed.allUnits") }, ...units].map((x) => (
                      <button key={x.id} type="button" role="menuitemradio" aria-checked={unit === x.id} className={s.pick} data-on={unit === x.id ? "true" : undefined} onClick={() => { setUnit(x.id); setMenu(null); }}>
                        <span className={s.label}>{x.name}</span>
                        {quietCount(visible.filter((v) => inSites(v, site) && (x.id === ALL_UNITS || inUnit(unitIdOf(v.c), x.id))).length, s.count)}
                        <span className={s.check}>{unit === x.id ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className={s.div6}>
              <button type="button" className={s.toggleSort} onClick={() => setMenu(menu === "sort" ? null : "sort")} aria-expanded={menu === "sort"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
                {t(FEED_SORT_KEY[sort])}
              </button>
              {menu === "sort" && (
                <div className={s.div7} role="menu">
                  {FEED_SORTS.map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={s.pick} data-on={sort === k ? "true" : undefined} onClick={() => { setSort(k); setMenu(null); }}>
                      <span className={s.label}>{t(FEED_SORT_KEY[k])}</span>
                      <span className={s.check}>{sort === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {split && (
              <button type="button" className={s.toggleArchive} onClick={() => { setView(otherView); setMenu(null); }}>
                {view === "open" ? t("dashboard.archiveArchive") : t("feed.backToOpen")}
                {quietCount(everything.filter((x) => inView(archiveOf(x.c), otherView)).length, s.count)}
              </button>
            )}
          </div>
        </div>

        <div className={s.div9}>
          {cards.shown.map((x, k) => {
            const { c } = x, st = feedStage(c, ctx.locale);
            // Until covers are generated per idea (docs/AI_COVERS.md): the sample idea's own picture and
            // text, else a library picture with its text (features/cases/thumbs.ts).
            const pic = sampleCoverFor(c) ?? libraryCoverFor(c.id);
            const own = pic ?? feedCover(c, x.backing.length);
            const cover = { stat: own.stat, hook: own.hook, image: pic?.src ?? null, fit: pic?.fit ?? 1 };
            return (
              <div key={c.id} className={s.open} role="link" tabIndex={0} data-screen-label="Feed card" style={{ animationDelay: k * 70 + "ms" }}
                onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(c.id); }}>
                <div className={s.aiImg}>
                  {cover.image && cover.fit > 0 && (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed 16:9 cover, placed by Step 3 (scale + mask)
                    <img src={cover.image} alt="" className={s.coverImg} loading="lazy" data-placed={cover.fit < 1 ? "true" : undefined}
                      style={cover.fit < 1 ? ({ "--fit": cover.fit } as React.CSSProperties) : undefined} />
                  )}
                  <div className={s.scrim} aria-hidden="true" />
                  <div className={s.div10}>
                    <PersonFace name={c.from} />
                    <div className={s.div11}>
                      <span className={s.author}>{c.from}</span>
                      <span className={s.dept}>{c.fromDept ? <DeptChip name={c.fromDept} /> : null}{c.fromDept && (x.site || log.day - c.raisedDay >= 0) ? " · " : ""}{[x.site, ago(t, log.day - c.raisedDay)].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className={s.stage} data-tone={st.tone}>{st.label}</span>
                  </div>
                  <div className={s.div12}>
                    <div className={s.div13}>
                      <span className={s.coverStat} data-long={cover.stat.length >= 7 ? "true" : undefined}>{cover.stat}</span>
                      {cover.hook && <span className={s.coverHook}>{cover.hook}</span>}
                    </div>
                  </div>
                </div>
                <h3 className={s.title}>{c.title}</h3>
                <span className={s.latest} data-testid="feed-latest">{latestLine(c, x.activity)}</span>
                <span className={s.supporters}>{supportersLine(x)}</span>
                <div className={s.div14}>
                  <div className={s.div15}>
                    {avatars(x).map((a) => <PersonFace key={a.name} name={a.name} size="sm" />)}
                  </div>
                  <button type="button" className={s.toggleSupport} data-on={x.supported ? "true" : undefined} aria-pressed={x.supported}
                    onClick={(e) => { e.stopPropagation(); support(x); }}>
                    {x.supported ? <Check size={13} /> : <UpArrow size={13} w={2.6} />}{x.supported ? t("team.feedSupported") : t("team.feedSupport")}{quietCount(x.backing.length, s.supCount)}
                  </button>
                  {x.comments > 0 && <span className={s.commentCount}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
                    {x.comments}
                  </span>}
                  <span className={s.label} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nh-ghost)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </div>
              </div>
            );
          })}
        </div>
        <ShowAll list={cards} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
        {!list.length && <div className={s.div16}>{visible.length ? t("team.feedNoMatch") : split && view === "archive" ? t("team.feedNoArchive") : t("feed.emptyFeed")}</div>}
        <p className={s.windowNote}>{t("feed.windowFooter")}</p>
      </div>
    </div>
  );
}

