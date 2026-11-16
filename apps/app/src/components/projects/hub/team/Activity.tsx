"use client";
// Activity in the card style of the redesign: what was said and what happened, newest first, under day headers.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import type { ReducedProject } from "@/features/projects/types";
import { timelineOf } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useSend } from "../../parts";
import styles from "./Team.module.css";

type FeedItem = { kind: "comment" | "event"; id: string; by: string; text: string; day: number };

export function Activity({ p }: { p: ReducedProject }) {
  const { act, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const send = useSend(p);
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  const lines = new Map(timelineOf(p, locale).map((l) => [l.id, l]));
  const feed = p.history.slice().reverse().flatMap((e): FeedItem[] => {
    if (e.type === "project.commented") return [{ kind: "comment", id: e.id, by: e.actor, text: e.payload.text ?? "", day: e.day }];
    const l = lines.get(e.id);
    return l ? [{ kind: "event", ...l }] : [];
  });
  const comments = feed.filter((x) => x.kind === "comment").length;
  const events = feed.length - comments;
  const shown = more ? feed : feed.slice(0, 8);
  const days = shown.reduce<{ day: number; items: FeedItem[] }[]>((acc, x) => {
    const last = acc[acc.length - 1];
    if (last && last.day === x.day) last.items.push(x); else acc.push({ day: x.day, items: [x] });
    return acc;
  }, []);

  return (
    <section className={styles.card} aria-labelledby={"activity-" + p.id}>
      <div className={styles.head}>
        {/* Its section (or the page) carries the name: kept for screen readers only (DESIGN_RULES §9). */}
        <h2 id={"activity-" + p.id} className="nh-sr">{t("projects.activityTitle")}</h2>
        <span className={styles.muted}>{[comments ? t("projects.commentCount", { count: comments }) : "", events ? t("projects.eventCount", { count: events }) : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (send("project.commented", { text }, () => act.project.comment(p.id, text.trim()))) setText(""); }}>
        <textarea className={`nh-input nh-textarea ${styles.field}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("projects.commentPlaceholder")} aria-label={t("projects.comment")} maxLength={2000} />
        {text.trim() && <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projects.comment")}</button>}
      </form>
      {days.map((d) => (
        <div key={d.day}>
          <h3 className={styles.day}>{f(d.day)}</h3>
          <ol className={styles.rows}>
            {d.items.map((x) => (
              <li key={x.id} className={`${styles.row} ${styles.comment}`}>
                {x.kind === "comment" ? (
                  <>
                    <PersonFace name={x.by} size="sm" />
                    <span className={styles.commentBody}><span className={styles.by}>{x.by}</span><span>{x.text}</span></span>
                  </>
                ) : <span className={styles.event}><strong>{x.by}</strong> {x.text}</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {feed.length > 8 && <button type="button" className={styles.link} onClick={() => setMore(!more)}>{more ? t("projects.showLess") : t("projects.showAll", { count: feed.length })}</button>}
    </section>
  );
}
