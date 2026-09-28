"use client";
// Right side of the idea studio: the score against the publish line, Publish, and everything else
// you can do with the draft - name it, who it touches, evidence, what already exists, discard.
// Props in, JSX out; every action is a callback the studio wires to the draft.
import Link from "next/link";
import { useRef, useState } from "react";
import type { BenchmarkPart } from "@/features/ideas/benchmarks";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { toGo } from "@/features/ideas/coach";
import type { Shot } from "@/lib/shots";
import { AffectedPicker } from "./AffectedPicker";
import { ScoreRing } from "./ScoreRing";
import { ago } from "./DraftRail";
import styles from "./IdeaStudio.module.css";

const MAX_SHOTS = 4;
export type Similar = { id: string; title: string; from: string; affectsMe: boolean };

export function ActionPanel(p: {
  started: boolean; // a draft exists
  published: { caseHref: string } | null;
  title: string;
  savedAt: string | null;
  parts: readonly BenchmarkPart[];
  overall: number;
  threshold: number;
  busy: boolean;
  people: readonly OrgPerson[]; depts: readonly Dept[]; me: string;
  affected: string[]; onAffected: (next: string[]) => void;
  shots: Shot[]; reading: number; onAttach: (files: FileList | null) => void; onRemoveShot: (url: string) => void;
  similar: Similar | null; similarHref: string | null; onMeToo: () => void;
  onPublish: () => void; onSave: () => void; onRename: (title: string) => void; onDiscard: () => void; onNew: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.title);
  const [sure, setSure] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ready = p.started && p.overall >= p.threshold;
  const pct = Math.min(100, p.overall);

  if (p.published) {
    return (
      <aside className={styles.actions} aria-label="Actions">
        <div className={styles.scoreBlock}>
          <ScoreRing parts={p.parts} overall={p.overall} size={112} />
          <p className={styles.scoreDone}>Published</p>
        </div>
        <Link href={p.published.caseHref} className={styles.primary}>Open the case</Link>
        <button type="button" className={styles.secondary} onClick={p.onNew}>Start a new idea</button>
      </aside>
    );
  }

  return (
    <aside className={styles.actions} aria-label="Actions">
      <div className={styles.scoreBlock}>
        <ScoreRing parts={p.parts} overall={p.overall} size={112} />
        <div className={styles.meter} aria-hidden="true">
          <span className={styles.meterClip}><span className={styles.meterFill} data-ready={ready ? "true" : undefined} style={{ transform: `scaleX(${pct / 100})` }} /></span>
          <span className={styles.meterTick} style={{ left: p.threshold + "%" }} />
        </div>
        <p className={styles.toGo} data-ready={ready ? "true" : undefined}>{p.started ? toGo(p.overall, p.threshold) : "Publish at " + p.threshold}</p>
      </div>

      <button type="button" className={styles.primary} onClick={p.onPublish} disabled={!ready || p.busy}
        title={ready ? "Send it to the person who can decide" : "Reach " + p.threshold + " to publish"}>
        Publish idea
      </button>
      <p className={styles.primaryNote}>{ready ? "Routes it to the person who can decide, with an answer date." : "The coach tells you what would lift the score."}</p>

      <div className={styles.group}>
        <span className={styles.groupL}>Draft</span>
        {renaming ? (
          <form className={styles.renameRow} onSubmit={(e) => { e.preventDefault(); if (name.trim()) { p.onRename(name.trim()); setRenaming(false); } }}>
            <input className={styles.renameField} value={name} onChange={(e) => setName(e.target.value)} maxLength={140} aria-label="Idea title" autoFocus />
            <button type="submit" className={styles.mini}>Save</button>
          </form>
        ) : (
          <button type="button" className={styles.row} onClick={() => { setName(p.title); setRenaming(true); }} disabled={!p.started}>
            <span className={styles.rowIcon} aria-hidden="true">✎</span>
            <span className={styles.rowText}>{p.title || "Untitled idea"}</span>
          </button>
        )}
        <button type="button" className={styles.row} onClick={p.onSave} disabled={!p.started || p.busy}>
          <span className={styles.rowIcon} aria-hidden="true">⤓</span>
          <span className={styles.rowText}>Save as draft</span>
          <span className={styles.rowMeta}>{p.savedAt ? "saved " + ago(p.savedAt) : "not started"}</span>
        </button>
      </div>

      <div className={styles.group}>
        <span className={styles.groupL}>Context</span>
        <AffectedPicker people={p.people} depts={p.depts} me={p.me} value={p.affected} onChange={p.onAffected} disabled={p.busy} block />
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => p.onAttach(e.target.files)} />
        <button type="button" className={styles.row} onClick={() => file.current?.click()} disabled={p.busy || p.shots.length + p.reading >= MAX_SHOTS}>
          <span className={styles.rowIcon} aria-hidden="true">⎘</span>
          <span className={styles.rowText}>{p.reading ? "Adding…" : "Attach evidence"}</span>
          <span className={styles.rowMeta}>{p.shots.length ? p.shots.length + " / " + MAX_SHOTS : "photo or screenshot"}</span>
        </button>
        {p.shots.length > 0 && (
          <div className={styles.shots}>
            {p.shots.map((s) => (
              <span key={s.url} className={styles.shot}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
                <img src={s.url} alt={s.name} />
                <button type="button" onClick={() => p.onRemoveShot(s.url)} aria-label={"Remove " + s.name}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {p.similar && (
        <div className={styles.group}>
          <span className={styles.groupL}>Already raised</span>
          <div className={styles.similar}>
            <p className={styles.similarTitle}>“{p.similar.title}”</p>
            <p className={styles.similarMeta}>by {p.similar.from} · still open</p>
            <div className={styles.similarRow}>
              {p.similarHref && <Link href={p.similarHref} className={styles.mini}>Open</Link>}
              <button type="button" className={styles.mini} data-on={p.similar.affectsMe ? "true" : undefined} onClick={p.onMeToo}>{p.similar.affectsMe ? "✓ Backed" : "Back it instead"}</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.groupEnd}>
        {sure ? (
          <span className={styles.sure}>
            Discard this draft?
            <button type="button" className={styles.danger} onClick={() => { setSure(false); p.onDiscard(); }}>Discard</button>
            <button type="button" className={styles.mini} onClick={() => setSure(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className={styles.quiet} onClick={() => setSure(true)} disabled={!p.started || p.busy}>Discard draft</button>
        )}
      </div>
    </aside>
  );
}
