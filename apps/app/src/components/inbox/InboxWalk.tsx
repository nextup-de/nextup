"use client";
// The walk through the inbox, in the Inbox's side view under its pages (Kevin, 17 Nov 2026; DESIGN_RULES §4, §8): one
// quiet row per item that opens an idea, in the inbox's order (features/inbox/walk.ts), a mark, the title on one line, a
// dot when late, the open one marked; under it that idea's own pages, Idea, Files and Chats. The same beside an item
// opened in the inbox (/inbox?id=) and beside an idea's page (/idea?id=), so an idea has one layout. Draws nothing
// while the side view is hidden or on a phone (AreaSideSlot).
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { AreaSideSlot } from "@/components/shell/AreaFrame";
import type { WalkItem } from "@/features/inbox/walk";
import { ideaPath } from "@/features/ideas/page-path";
import { useT } from "@/i18n/client";
import styles from "./InboxWalk.module.css";

/** An idea's own pages: the idea itself, its files, its chats (features/projects/sidebar.ts IDEA_TABS + IDEA_EXTRA_TABS). */
export type IdeaPageKey = "overview" | "files" | "chats";
const PAGES: readonly IdeaPageKey[] = ["overview", "files", "chats"];
const LABEL = { overview: "projects.idea_overview", files: "projects.idea_files", chats: "projects.idea_chats" } as const;

/**
 * `page`: which of the open idea's pages is shown. Its "Idea" page is where its row leads (an item decided in the inbox
 * opens there). `counts`: how many files and chats, when there are any. `onPick`: an item that opens in place is opened
 * without leaving the page (the inbox's own pane).
 */
export function InboxWalk({ items, openId, page, counts, onPick }: {
  items: readonly WalkItem[]; openId: string; page: IdeaPageKey;
  counts: Partial<Record<IdeaPageKey, number>>; onPick?: (id: string) => void;
}) {
  const { href } = useDemo();
  const t = useT();
  const pageHref = (r: WalkItem, k: IdeaPageKey) => href(k === "overview" ? r.href : ideaPath(r.id) + "&page=" + k);
  return (
    <AreaSideSlot>
      <ul className={styles.list} aria-label={t("inbox.walk")} data-testid="inbox-walk">
        {items.map((r) => {
          const current = r.id === openId;
          const row = (
            <>
              <span className={styles.mark} aria-hidden="true" />
              <span className={styles.label}>{r.title}</span>
              {r.late ? <span className={styles.late}><span className={styles.srOnly}>{t("inbox.late")}</span></span> : null}
            </>
          );
          const attrs = { className: styles.row, "data-testid": "inbox-side-row", "aria-current": current ? ("true" as const) : undefined };
          return (
            <li key={r.id}>
              {onPick && r.inPlace
                ? <button type="button" {...attrs} onClick={() => onPick(r.id)}>{row}</button>
                : <Link href={href(r.href)} {...attrs}>{row}</Link>}
              {current && (
                <nav className={styles.pages} aria-label={t("inbox.ideaPages")} data-testid="idea-pages">
                  {PAGES.map((k) => (
                    <Link key={k} href={pageHref(r, k)} className={styles.page} aria-current={k === page ? "true" : undefined}>
                      <span className={styles.label}>{t(LABEL[k])}</span>
                      {counts[k] ? <span className={styles.count}>{counts[k]}</span> : null}
                    </Link>
                  ))}
                </nav>
              )}
            </li>
          );
        })}
      </ul>
    </AreaSideSlot>
  );
}
