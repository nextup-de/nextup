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
import { safeUrl } from "@/features/projects/views";
import styles from "./Projects.module.css";

export function OriginPanel({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const cases = p.sources.map((id) => S.cases.find((c) => c.id === id)).filter((c): c is ReducedCase => !!c);
  const ideas = p.sources.map((id) => S.ideas.find((i) => i.id === id)).filter((i) => !!i);
  if (!cases.length && !ideas.length) return null;

  return (
    <section className={styles.panel} aria-labelledby={"origin-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"origin-" + p.id} className={styles.h2}>The idea</h2>
        <span className={styles.muted}>as it was raised, and what the discussion made of it</span>
      </div>
      {cases.map((c) => (
        <article key={c.id} className={styles.origin} aria-label={c.title}>
          <div className={styles.originTitle}>{c.title}</div>
          <div className={styles.muted}>Raised by {c.from} · {f(c.raisedDay)}</div>
          {c.body && <p className={styles.originBody}>{c.body}</p>}
          {c.reason && <p className={styles.originLine}><span className={styles.originKey}>Why</span>{c.reason}</p>}
          {c.upside && <p className={styles.originLine}><span className={styles.originKey}>Upside</span>{c.upside}</p>}
          {c.versions.length > 1 && (
            <details className={styles.versions}>
              <summary>{c.versions.length} versions</summary>
              {c.versions.map((v) => (
                <div key={v.version} className={styles.version}>
                  <div className={styles.muted}>v{v.version} · {v.by} · {f(v.day)}{v.overall !== null ? " · score " + v.overall : ""}</div>
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
          <div className={styles.muted}>Proposed by {i.proposedBy}</div>
          {i.problem && <p className={styles.originLine}><span className={styles.originKey}>Problem</span>{i.problem}</p>}
          {i.expected && <p className={styles.originLine}><span className={styles.originKey}>Expected</span>{i.expected}</p>}
          {i.upside && <p className={styles.originLine}><span className={styles.originKey}>Upside</span>{i.upside}</p>}
          {i.rationale && <p className={styles.originLine}><span className={styles.originKey}>Why</span>{i.rationale}</p>}
        </article>
      ))}
    </section>
  );
}

// Where to find the rest: the source cases and ideas with the files raised alongside, the ticket keys
// the steps carry, and a way back to the full list.
export function FilesPanel({ p }: { p: ReducedProject }) {
  const { S, href } = useDemo();
  const rows = p.sources.map((id) => {
    const c = S.cases.find((x) => x.id === id);
    if (c) return { id, title: c.title, to: href("/cases/" + id), files: raisedWith(c).attachments };
    const i = S.ideas.find((x) => x.id === id);
    return { id, title: i?.title ?? id, to: i ? href("/ideas?id=" + id) : null, files: 0 };
  });
  const tickets = p.steps.filter((s) => s.external);

  return (
    <section className={styles.panel} aria-labelledby={"files-" + p.id}>
      <h2 id={"files-" + p.id} className={styles.h2}>Files and sources</h2>
      <ul className={styles.links}>
        {rows.map((r) => (
          <li key={r.id} className={styles.linkRow}>
            {r.to ? <Link href={r.to} className={styles.link}>{r.title}</Link> : <span>{r.title}</span>}
            <span className={styles.muted}>{r.files > 0 ? r.files + (r.files === 1 ? " file" : " files") + " attached" : "no files"}</span>
          </li>
        ))}
        {tickets.map((s) => {
          const url = safeUrl(s.external?.url);
          return (
            <li key={s.id} className={styles.linkRow}>
              {url ? <a href={url} target="_blank" rel="noreferrer noopener" className={styles.link}>{s.external?.key}</a> : <span>{s.external?.key}</span>}
              <span className={styles.muted}>on “{s.text}”</span>
            </li>
          );
        })}
      </ul>
      <Link href={href("/overview")} className={styles.link}>All ideas and problems →</Link>
    </section>
  );
}
