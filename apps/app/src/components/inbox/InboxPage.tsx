"use client";
// The one inbox (plan INB): what is asked of this person in three asks - Decide, Approve or confirm, Do my part - from
// `inboxItems`, each group headed by its count, and the notices below when there are any. A decide item opens in place
// with the same detail the leader inbox uses, in the old leader inbox's layout (InboxOpen: the avatar rail beside the
// item); every other item goes to its own page. Same for every role, in the demo and on a company. Quiet (DESIGN_RULES
// §9): the bar names the page, so its heading is for screen readers only; a row is its title and one fact.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { inboxIdeas } from "@/components/dashboard/derive";
import { IdeaDetailPhone } from "@/components/dashboard/leader/IdeaDetailPhone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { BulkBar } from "@/components/overload/BulkBar";
import { DeskLoadCard } from "@/components/overload/DeskLoadCard";
import { SectionCard } from "@/components/ui/elements";
import { inboxItems, type CommentsInboxInput, type InboxAsk, type InboxItem, type InboxKind } from "@/features/inbox";
import { noticesBesideItems, type NoticeView } from "@/features/inbox/notices";
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
import { InboxOpen, type RailItem } from "./InboxOpen";
import { useOpenItem } from "./useOpenItem";
import styles from "./InboxPage.module.css";


const ASKS: readonly InboxAsk[] = ["decide", "confirm", "part"];
const ASK_TITLE: Record<InboxAsk, MessageKey> = { decide: "inbox.askDecide", confirm: "inbox.sectionConfirm", part: "inbox.askPart" };
/** Every kind says what it asks for; a project move is named by its move on the row itself (kindText). */
const KIND: Record<Exclude<InboxKind, "case">, MessageKey> = {
  idea: "inbox.kindIdea", view: "inbox.kindView", question: "inbox.kindQuestion", confirm: "inbox.kindConfirm",
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
  const { S, me, seed, role, demo, flag, ready, href, serverMode, tenant } = ctx;
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
  const desk = projectDesk(input);
  // Why a case is back on the list: its plain cause, a pass who passed it (plan REM, I1). The pass's reason is in the open item.
  const causeText = (cause: NonNullable<InboxItem["cause"]>, i: InboxItem): string =>
    cause === "passed" && i.fromRole ? t("inbox.passedByNoWhy", { role: i.fromRole }) : t(CAUSE[cause]);
  // What is asked, for a row that is not decided here: a comment row how many are new, a project move which move it is ("Take
  // the baseline"), a result to confirm that it is asked, or that it came up to this desk late (decision Q6.15), every other row its kind.
  const moveOf = (i: InboxItem) => desk.find((x) => x.project.id === i.projectId && (i.kind === "confirm" ? x.move === "confirm" : i.kind === "move" && (x.why === "lead" || x.why === "escalated")));
  const askedText = (i: InboxItem): string => {
    if (i.kind === "comment") return t(i.count === 1 ? "inbox.commentOne" : "inbox.commentMany", { n: i.count ?? 0 });
    const d = moveOf(i);
    if (d?.why === "confirmUp") return t("inbox.causeUp");
    return d ? moveLabel(d.move, locale) : i.kind === "case" ? "" : t(KIND[i.kind]);
  };
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
  // A notice about a row of the list above is that row's echo: the row is where to act, so the notice waits until it is gone.
  const shown = noticesBesideItems(notices, items);
  const unread = shown.filter((n) => !n.read && !readIds.has(n.id));
  const markAll = () => start(async () => {
    const r = await markNoticesReadAction(tenant.slug);
    if (!r.ok) { setFailed(true); return; }
    setFailed(false);
    setReadIds(new Set(notices.map((n) => n.id))); // the server marked every one, the hidden echoes too
    router.refresh();
  });
  const markOne = (id: string) => start(async () => {
    const r = await markNoticesReadAction(tenant.slug, [id]);
    if (r.ok) { setReadIds((s) => new Set(s).add(id)); router.refresh(); } else setFailed(true);
  });

  // Who raised each item to decide, for its avatar on the rail: the idea's proposer ("C. Ilg, Ops") or the case's raiser.
  const ideaBy = new Map(inboxIdeas(ctx).map((x) => [x.id, x.proposedBy.split(", ")[0]]));
  const whoOf = (i: InboxItem) => { const id = openId(i); return ideaBy.get(id) ?? S.cases.find((c) => c.id === id)?.from ?? ""; };
  const rail: RailItem[] = decide.map((i) => ({ id: openId(i), title: i.title, who: whoOf(i), late: i.late, dueSoon: i.dueSoon }));

  // One fact per row (DESIGN_RULES §9): why it is back on the list, else who raised what is to decide here, else what is asked.
  const factOf = (i: InboxItem): string => {
    if (i.cause) return causeText(i.cause, i);
    const who = i.ask === "decide" && opensInPlace(i) ? whoOf(i) : "";
    return who || askedText(i);
  };

  // The notices: below the lists, only when there are any. Not under an open item: the item is what is in front of you.
  const noticesCard = shown.length === 0 ? null : (
    <SectionCard
      title={t("inbox.notices")}
      name="inbox-notices"
      action={serverMode && unread.length > 0 ? <button type="button" className={styles.markAll} onClick={markAll} disabled={pending}>{t("inbox.markAllRead")}</button> : undefined}
    >
      <ul className={styles.notices}>
        {shown.map((n) => {
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
      {failed && <p className={styles.error} role="alert">{t("inbox.markFailed")}</p>}
    </SectionCard>
  );

  if (isOpen && !phone && cid !== null) {
    return (
      <div className={styles.page}>
        <InboxOpen items={rail} openId={cid} detail={detail} onPick={pick} onClose={() => setCid(null)} sheetOpen={!!ctx.sheet} />
      </div>
    );
  }

  if (isOpen && phone) {
    return (
      <div className={styles.page}>
        <IdeaDetailPhone key={detail.idea.id} {...detail} nav={{ index: at, count: navIds.length, onPrev: () => at > 0 && pick(navIds[at - 1]), onNext: () => at >= 0 && at < navIds.length - 1 && pick(navIds[at + 1]) }} />
      </div>
    );
  }

  return (
    <div className={styles.page} ref={topRef}>
      <h1 className={styles.srOnly}>{t("inbox.title")}</h1>

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

      <div className={styles.body}>
        <div className={styles.lists}>
          {items.length === 0 ? (
            <SectionCard name="inbox-empty"><p className={styles.empty}>{t("inbox.empty")}</p></SectionCard>
          ) : ASKS.map((ask) => {
            const list = items.filter((i) => i.ask === ask);
            if (list.length === 0) return null;
            return (
              <SectionCard key={ask} title={t(ASK_TITLE[ask])} name={`inbox-${ask}`} action={<span className={styles.count} data-testid="inbox-count">{list.length}</span>}>
                <ul className={styles.list}>
                  {list.map((i) => {
                    const open = ask === "decide" && opensInPlace(i) && cid === openId(i);
                    const body = (
                      <>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{i.title}</span>
                          {i.cause ? <span className={styles.rowKind} data-testid="inbox-cause" data-cause={i.cause}>{factOf(i)}</span> : factOf(i) ? <span className={styles.rowKind}>{factOf(i)}</span> : null}
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
      </div>

      {noticesCard}
    </div>
  );
}
