"use client";
// The one inbox (plan INB): what is asked of this person in three asks - Decide, Approve or confirm, Do my part - from
// `inboxItems`, with the Today line above and the notices below. A decide item opens in place with the same detail
// the leader inbox uses; every other item goes to its own page. Same for every role, in the demo and on a company.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { IdeaDetail } from "@/components/dashboard/leader/IdeaDetail";
import { IdeaDetailPhone } from "@/components/dashboard/leader/IdeaDetailPhone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { BulkBar } from "@/components/overload/BulkBar";
import { DeskLoadCard } from "@/components/overload/DeskLoadCard";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { inboxCounts, inboxItems, type CommentsInboxInput, type InboxAsk, type InboxItem, type InboxKind } from "@/features/inbox";
import { agentForInbox } from "@/features/inbox/sources/agent";
import { deskLoads } from "@/features/overload/load";
import { triageFor } from "@/features/overload/bulk";
import { projectDesk } from "@/features/inbox/sources/projects";
import { moveLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { showInboxCase } from "@/lib/demo-controls";
import { useIdInUrl } from "@/lib/use-url-id";
import { markNoticesReadAction } from "@/server/actions/notices";
import { useOpenItem } from "./useOpenItem";
import styles from "./InboxPage.module.css";

/** A notice as the page shows it: plain values, so it crosses from the server page. */
export type NoticeView = { id: string; subject: string; text: string; link: string | null; createdAt: string; read: boolean };

const ASKS: readonly InboxAsk[] = ["decide", "confirm", "part"];
const ASK_TITLE: Record<InboxAsk, MessageKey> = { decide: "inbox.askDecide", confirm: "inbox.sectionConfirm", part: "inbox.askPart" };
/** Every kind says what it asks for; a project move is named by its move on the row itself (kindText). */
const KIND: Record<InboxKind, MessageKey> = {
  case: "inbox.kindCase", idea: "inbox.kindIdea", view: "inbox.kindView", question: "inbox.kindQuestion", confirm: "inbox.kindConfirm",
  reward: "inbox.kindReward", move: "inbox.kindMove", lead: "inbox.kindLead", invitation: "inbox.kindInvitation", approval: "inbox.kindApproval",
  stalled: "inbox.kindStalled", vacant: "inbox.kindVacant", update: "inbox.kindUpdate", appeal: "inbox.kindAppeal",
  help: "inbox.kindHelp", baseline: "inbox.kindBaseline", suggestion: "inbox.kindSuggestion", comment: "inbox.kindComment",
};
/** Why a case is back on the list (plan NOR, D26). */
const CAUSE: Record<NonNullable<InboxItem["cause"]>, MessageKey> = {
  reopened: "caseNo.cameBack", passed: "caseNo.passedToYou", back: "inbox.causeBack", up: "inbox.causeUp", moved: "caseNo.movedToYou",
};
// A decide item is opened by the id of its case or idea (the ?id= of its link). A project's own decide item (a stalled project, one with no
// lead) has no case detail: its row is the link to the project page (plan MOV, D28).
// A second look is answered on its case page (a link), not in this list's pane.
const opensInPlace = (i: InboxItem) => i.projectId === undefined && i.kind !== "appeal";
const openId = (i: InboxItem) => i.caseId ?? i.id.slice(i.id.indexOf(":") + 1);

const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };

export function InboxPage({ initialId, notices }: { initialId?: string; notices: NoticeView[] }) {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { S, me, seed, role, demo, flag, ready, href, f, serverMode, tenant } = ctx;
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);
  // Selection mode (plan OVL, D21): decide items of one desk are ticked, then passed on or asked in bulk.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, start] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const detail = useOpenItem(cid, () => setCid(null));
  const isOpen = cid !== null && detail !== null;
  // The open item is in the address (?id=), so a link, a reload and Back land on it.
  useIdInUrl(cid, (id) => setCid(id));
  // The static demo's controls follow along: a case opened here by hand is a step they pass over.
  useEffect(() => showInboxCase(isOpen ? cid : null), [isOpen, cid]);

  if (!ready) return <PageSkeleton kind="inbox" />;

  const input: CommentsInboxInput & { role: typeof role } = {
    state: S, me, seats: seed.seats ?? [], today: S.day, demo, role, flags: { projects: flag("projects"), discussion: flag("discussion") },
    agent: agentForInbox(ctx.log, S, { flagOn: flag("agent"), serverMode, demo }),
    events: ctx.log.events, // the unread comments are read from the log (plan REM, I1)
  };
  const items = inboxItems(input);
  // A result to confirm says what is asked and why it is on this desk (decision Q6.15), as the project desk words it.
  const desk = projectDesk(input);
  const confirmNote = (i: InboxItem): string | null => {
    const d = i.kind === "confirm" ? desk.find((x) => x.move === "confirm" && x.project.id === i.projectId) : undefined;
    return d ? `${moveLabel(d.move, locale)} · ${t(d.why === "confirmUp" ? "projects.deskConfirmLate" : "projects.deskSecondPerson")}` : null;
  };
  // Why a case is back on the list: a pass says who passed it and why (plan REM, I1), the others their plain cause.
  const causeText = (i: InboxItem): string | null => {
    if (!i.cause) return null;
    if (i.cause !== "passed") return t(CAUSE[i.cause]);
    if (i.fromRole) return i.why ? t("inbox.passedBy", { role: i.fromRole, why: i.why }) : t("inbox.passedByNoWhy", { role: i.fromRole });
    return i.why ? t("inbox.passedWhy", { why: i.why }) : t(CAUSE.passed);
  };
  // A comment row says how many are new, a project move which move it is ("Take the baseline"), every other row its kind.
  const moveOf = (i: InboxItem) => (i.kind === "move" ? desk.find((x) => x.project.id === i.projectId && (x.why === "lead" || x.why === "escalated")) : undefined);
  const kindText = (i: InboxItem): string => {
    if (i.kind === "comment") return t(i.count === 1 ? "inbox.commentOne" : "inbox.commentMany", { n: i.count ?? 0 });
    const d = moveOf(i);
    return d ? moveLabel(d.move, locale) : t(KIND[i.kind]);
  };
  const counts = inboxCounts(items);
  const decide = items.filter((i) => i.ask === "decide" && opensInPlace(i));
  const navIds = decide.map(openId);
  // A case to decide on a desk may be selected; one desk at a time, the first selection fixes it.
  const selectable = (i: InboxItem) => i.ask === "decide" && i.kind === "case" && i.caseId !== undefined && i.projectId === undefined;
  const deskOf = (i: InboxItem) => i.deskRoleId ?? "-";
  const anySelectable = items.some(selectable);
  const firstPicked = items.find((i) => selectable(i) && selected.has(i.caseId!));
  const selectedCases = S.cases.filter((c) => selected.has(c.id));
  const triage = triageFor(deskLoads(S, S.day), me);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const leaveSelecting = () => { setSelecting(false); setSelected(new Set()); };
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

      {/* The seat above a loaded desk cannot open the Dashboard (OVL D36): the same card, for the desks it may share the load of, sits here. */}
      <DeskLoadCard shareOnly />
      {triage.map((d) => (
        <p key={d.roleId} className={styles.triage} data-testid="inbox-triage" data-level={d.level} role="status">
          <span>{t(d.key)}</span>
          {d.lateKey ? <span className={styles.triageLate}>{t(d.lateKey, { count: d.late })}</span> : null}
        </p>
      ))}
      {anySelectable && (
        <div className={styles.toolbar}>
          <button type="button" className={styles.select} aria-pressed={selecting} onClick={() => (selecting ? leaveSelecting() : setSelecting(true))} data-testid="inbox-select">{t("overload.inbox.select")}</button>
        </div>
      )}
      {selecting && <div className={styles.bulk}><BulkBar cases={selectedCases} onDone={() => setSelected(new Set())} /></div>}

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
                    const open = ask === "decide" && opensInPlace(i) && cid === openId(i);
                    const body = (
                      <>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{i.title}</span>
                          <span className={styles.rowKind}>{i.cause ? <span className={styles.cause} data-testid="inbox-cause" data-cause={i.cause}>{causeText(i)} · </span> : null}{confirmNote(i) ?? kindText(i)}{i.dueDay !== null ? " · " + t("inbox.dueOn", { day: f(i.dueDay) }) : ""}</span>
                        </span>
                        {i.late ? <span className={styles.badge} data-tone="late">{t("inbox.late")}</span> : i.dueSoon ? <span className={styles.badge} data-tone="soon">{t("inbox.dueSoon")}</span> : null}
                      </>
                    );
                    const choosable = selecting && selectable(i);
                    const blocked = choosable && firstPicked !== undefined && deskOf(firstPicked) !== deskOf(i);
                    return (
                      <li key={i.id}>
                        {choosable ? (
                          <label className={styles.row} data-testid="inbox-row" data-ask={ask} data-kind={i.kind} data-select="true" data-late={i.late ? "true" : undefined} data-soon={i.dueSoon ? "true" : undefined}>
                            <input type="checkbox" className={styles.check} checked={selected.has(i.caseId!)} disabled={blocked} onChange={() => toggle(i.caseId!)} aria-label={i.title} />
                            {body}
                          </label>
                        ) : ask === "decide" && opensInPlace(i)
                          ? <button type="button" className={styles.row} data-testid="inbox-row" data-ask={ask} data-kind={i.kind} data-late={i.late ? "true" : undefined} data-soon={i.dueSoon ? "true" : undefined} data-active={open ? "true" : undefined} aria-current={open ? "true" : undefined} onClick={() => pick(openId(i))}>{body}</button>
                          : <Link href={href(i.href)} className={styles.row} data-testid="inbox-row" data-ask={ask} data-kind={i.kind} data-late={i.late ? "true" : undefined} data-soon={i.dueSoon ? "true" : undefined}>{body}</Link>}
                        {i.pinned ? <span className={styles.pinned} data-testid="inbox-pinned">{t("overload.inbox.pinned")}</span> : null}
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
