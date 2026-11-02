"use client";
// Everything the project grew from, on the project's own page: the idea as raised (and its versions),
// the discussion and the archive line from the case, and a list of the files and links that belong to
// it. All of it is read from the events that already exist; nothing here is stored twice.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ArchiveBanner, DiscussionPanel } from "@/components/dashboard/shared/CaseLoop";
import type { ReducedCase } from "@/features/cases/reducer";
import { raisedWith } from "@/features/cases/rows";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export function OriginPanel({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const t = useT();
  const cases = p.sources.map((id) => S.cases.find((c) => c.id === id)).filter((c): c is ReducedCase => !!c);
  const ideas = p.sources.map((id) => S.ideas.find((i) => i.id === id)).filter((i) => !!i);
  if (!cases.length && !ideas.length) return null;

  return (
    <section className={styles.panel} aria-labelledby={"origin-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"origin-" + p.id} className={styles.h2}>{t("projects.originTitle")}</h2>
        <span className={styles.muted}>{t("projects.originSub")}</span>
      </div>
      {cases.map((c) => (
        <article key={c.id} className={styles.origin} aria-label={c.title}>
          <div className={styles.originTitle}>{c.title}</div>
          <div className={styles.muted}>{t("projects.originRaisedBy", { name: c.from, day: f(c.raisedDay) })}</div>
          {c.body && <p className={styles.originBody}>{c.body}</p>}
          {c.reason && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originWhy")}</span>{c.reason}</p>}
          {c.upside && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originUpside")}</span>{c.upside}</p>}
          {c.versions.length > 1 && (
            <details className={styles.versions}>
              <summary>{t("projects.originVersions", { count: c.versions.length })}</summary>
              {c.versions.map((v) => (
                <div key={v.version} className={styles.version}>
                  <div className={styles.muted}>v{v.version} · {v.by} · {f(v.day)}{v.overall !== null ? " · " + t("projects.originScore", { score: v.overall }) : ""}</div>
                  <p className={styles.originBody}>{v.body}</p>
                </div>
              ))}
            </details>
          )}
          <ArchiveBanner c={c} />
          <DiscussionPanel c={c} />
        </article>
      ))}
      {ideas.map((i) => i && (
        <article key={i.id} className={styles.origin} aria-label={i.title}>
          <div className={styles.originTitle}>{i.title}</div>
          <div className={styles.muted}>{t("projects.originProposedBy", { name: i.proposedBy })}</div>
          {i.problem && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originProblem")}</span>{i.problem}</p>}
          {i.expected && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originExpected")}</span>{i.expected}</p>}
          {i.upside && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originUpside")}</span>{i.upside}</p>}
          {i.rationale && <p className={styles.originLine}><span className={styles.originKey}>{t("projects.originWhy")}</span>{i.rationale}</p>}
        </article>
      ))}
    </section>
  );
}

// Where to find the rest: the source cases and ideas with the files raised alongside, and a way back
// to the full list. The tickets and folders the work lives in are under Connected tools.
export function FilesPanel({ p }: { p: ReducedProject }) {
  const { S, href } = useDemo();
  const t = useT();
  const rows = p.sources.map((id) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { id, title: c.title, to: href("/cases/" + id), files: raisedWith(c).attachments };
    const i = S.ideas.find((x) => x.id === id);
    return { id, title: i?.title ?? id, to: i ? href("/ideas?id=" + id) : null, files: 0 };
  });

  return (
    <section className={styles.railSection} aria-labelledby={"files-" + p.id}>
      <h2 id={"files-" + p.id} className={styles.h3}>{t("projects.filesTitle")}</h2>
      <ul className={styles.links}>
        {rows.map((r) => (
          <li key={r.id} className={styles.linkRow}>
            {r.to ? <Link href={r.to} className={styles.link}>{r.title}</Link> : <span>{r.title}</span>}
            <span className={styles.muted}>{r.files > 0 ? t("projects.filesAttached", { count: r.files }) : t("projects.filesNone")}</span>
          </li>
        ))}
      </ul>
      <Link href={href("/overview")} className={styles.link}>{t("projects.allIdeas")}</Link>
    </section>
  );
}
