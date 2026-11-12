"use client";
// The one inbox (plan INB): what is asked of this person in three asks - Decide, Approve or confirm, Do my part - from
// `inboxItems`, with the Today line above and the notices below. A decide item opens in place with the same detail
// the leader inbox uses; every other item goes to its own page. Same for every role, in the demo and on a company.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { IdeaDetail } from "@/components/dashboard/leader/IdeaDetail";
import { IdeaDetailPhone } from "@/components/dashboard/leader/IdeaDetailPhone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { inboxCounts, inboxItems, type InboxAsk, type InboxItem, type InboxKind } from "@/features/inbox";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { useIdInUrl } from "@/lib/use-url-id";
import { markNoticesReadAction } from "@/server/actions/notices";
import { useOpenItem } from "./useOpenItem";
import styles from "./InboxPage.module.css";

/** A notice as the page shows it: plain values, so it crosses from the server page. */
export type NoticeView = { id: string; subject: string; text: string; link: string | null; createdAt: string; read: boolean };

const ASKS: readonly InboxAsk[] = ["decide", "confirm", "part"];
const ASK_TITLE: Record<InboxAsk, MessageKey> = { decide: "inbox.askDecide", confirm: "inbox.sectionConfirm", part: "inbox.askPart" };
const KIND: Record<InboxKind, MessageKey> = {
  case: "inbox.kindCase", idea: "inbox.kindIdea", view: "inbox.kindView", question: "inbox.kindQuestion", confirm: "inbox.kindConfirm",
  reward: "inbox.kindReward", move: "inbox.kindMove", lead: "inbox.kindMove", invitation: "inbox.kindView", approval: "inbox.kindConfirm",
};
// A decide item is opened by the id of its case or idea (the ?id= of its link).
const openId = (i: InboxItem) => i.caseId ?? i.id.slice(i.id.indexOf(":") + 1);

const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };

export function InboxPage({ initialId, notices }: { initialId?: string; notices: NoticeView[] }) {
  const ctx = useDemo();
  const t = useT();
  const router = useRouter();
  const { S, me, seed, role, demo, flag, ready, href, f, serverMode, tenant } = ctx;
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const detail = useOpenItem(cid, () => setCid(null));
  const isOpen = cid !== null && detail !== null;
  // The open item is in the address (?id=), so a link, a reload and Back land on it.
  useIdInUrl(cid, (id) => setCid(id));

  if (!ready) return <PageSkeleton kind="inbox" />;

  const items = inboxItems({ state: S, me, seats: seed.seats ?? [], today: S.day, demo, role, flags: { projects: flag("projects"), discussion: flag("discussion") } });
  const counts = inboxCounts(items);
  const decide = items.filter((i) => i.ask === "decide");
  const navIds = decide.map(openId);
  const at = cid ? navIds.indexOf(cid) : -1;
  const pick = (id: string) => setCid(id);
  const unread = notices.filter((n) => !n.read && !readIds.has(n.id));
  const markAll = () => start(async () => {
    const r = await markNoticesReadAction(tenant.slug);
    if (!r.ok) { setFailed(true); return; }
    setFailed(false);
    setReadIds(new Set(notices.map((n) => n.id)));
    router.refresh();
  });
  const markOne = (id: string) => start(async () => {
    const r = await markNoticesReadAction(tenant.slug, [id]);
    if (r.ok) { setReadIds((s) => new Set(s).add(id)); router.refresh(); } else setFailed(true);
  });

  if (isOpen && phone) {
    return (
      <div className={styles.page}>
        <IdeaDetailPhone key={detail.idea.id} {...detail} nav={{ index: at, count: navIds.length, onPrev: () => at > 0 && pick(navIds[at - 1]), onNext: () => at >= 0 && at < navIds.length - 1 && pick(navIds[at + 1]) }} />
      </div>
    );
  }

  return (
    <div className={styles.page} ref={topRef}>
      <PageHeader title={t("inbox.title")} />
      <p className={styles.today} data-testid="inbox-today" aria-label={t("inbox.today")}>
        <span className={styles.todayLabel}>{t("inbox.today")}</span>
        <span data-testid="inbox-today-decide">{t("inbox.todayDecide", { n: counts.decide })}</span>
        <span className={styles.dot} aria-hidden="true">·</span>
        <span data-testid="inbox-today-late" data-hot={counts.late > 0 ? "true" : undefined}>{t("inbox.todayLate", { n: counts.late })}</span>
        <span className={styles.dot} aria-hidden="true">·</span>
        <span data-testid="inbox-today-part">{t("inbox.todayPart", { n: counts.waiting })}</span>
      </p>

      <div className={styles.body} data-open={isOpen ? "true" : undefined}>
        <div className={styles.lists}>
          {items.length === 0 ? (
            <SectionCard name="inbox-empty"><p className={styles.empty}>{t("inbox.empty")}</p></SectionCard>
          ) : ASKS.map((ask) => {
            const list = items.filter((i) => i.ask === ask);
            if (list.length === 0) return null;
            return (
              <SectionCard key={ask} title={t(ASK_TITLE[ask])} name={`inbox-${ask}`}>
                <ul className={styles.list}>
                  {list.map((i) => {
                    const open = ask === "decide" && cid === openId(i);
                    const body = (
                      <>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{i.title}</span>
                          <span className={styles.rowKind}>{t(KIND[i.kind])}{i.dueDay !== null ? " · " + t("inbox.dueOn", { day: f(i.dueDay) }) : ""}</span>
                        </span>
                        {i.late ? <span className={styles.badge} data-tone="late">{t("inbox.late")}</span> : i.dueSoon ? <span className={styles.badge} data-tone="soon">{t("inbox.dueSoon")}</span> : null}
                      </>
                    );
                    return (
                      <li key={i.id}>
                        {ask === "decide"
                          ? <button type="button" className={styles.row} data-testid="inbox-row" data-ask={ask} data-kind={i.kind} data-late={i.late ? "true" : undefined} data-soon={i.dueSoon ? "true" : undefined} data-active={open ? "true" : undefined} aria-current={open ? "true" : undefined} onClick={() => pick(openId(i))}>{body}</button>
                          : <Link href={href(i.href)} className={styles.row} data-testid="inbox-row" data-ask={ask} data-kind={i.kind} data-late={i.late ? "true" : undefined} data-soon={i.dueSoon ? "true" : undefined}>{body}</Link>}
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            );
          })}
        </div>
        {isOpen && (
          <div className={styles.pane}>
            <IdeaDetail key={detail.idea.id} {...detail} />
          </div>
        )}
      </div>

      <SectionCard
        title={t("inbox.notices")}
        name="inbox-notices"
        action={serverMode && unread.length > 0 ? <button type="button" className={styles.markAll} onClick={markAll} disabled={pending}>{t("inbox.markAllRead")}</button> : undefined}
      >
        {notices.length === 0 ? <p className={styles.empty}>{t("inbox.noticesEmpty")}</p> : (
          <ul className={styles.notices}>
            {notices.map((n) => {
              const isRead = n.read || readIds.has(n.id);
              return (
                <li key={n.id} className={styles.notice} data-testid="inbox-notice" data-read={isRead ? "true" : "false"}>
                  <span className={styles.unreadDot} data-on={isRead ? undefined : "true"} aria-hidden="true" />
                  <span className={styles.noticeMain}>
                    <span className={styles.noticeSubject}>{n.subject}{!isRead && <span className={styles.srOnly}> ({t("inbox.unread")})</span>}</span>
                    <span className={styles.noticeText}>{n.text.split("\n")[0]}</span>
                  </span>
                  <span className={styles.noticeActions}>
                    {n.link && /^https?:\/\//.test(n.link) ? <a href={n.link} className={styles.link}>{t("inbox.openLink")}</a> : n.link && n.link.startsWith("/") ? <Link href={href(n.link)} className={styles.link}>{t("inbox.openLink")}</Link> : null}
                    {!isRead && serverMode && <button type="button" className={styles.link} onClick={() => markOne(n.id)} disabled={pending}>{t("inbox.markRead")}</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {failed && <p className={styles.error} role="alert">{t("inbox.markFailed")}</p>}
      </SectionCard>
    </div>
  );
}
