"use client";
// The cases around a case (plan SEE, D15 to D17): what it follows up, what follows it, what it is related to, how many were merged into it;
// and, for the desk and managers, 'Maybe the same as' with Merge and Link, and a small picker of the cases they may open. A case the viewer
// may not open is named "a case" and not linked: nothing here says what a hidden case is called.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useRelatedCase, type Related } from "@/components/cases/useRelatedCase";
import { caseActions } from "@/features/cases/case-actions";
import { MERGE_NOTE_MAX, mayLink, mayMerge } from "@/features/cases/links";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import styles from "@/components/dashboard/shared/CaseDetailView.module.css";

const PICKER_ROWS = 8;

export function CaseRelations({ c }: { c: ReducedCase }) {
  const { S, me, role, act, showToast } = useDemo();
  const t = useT();
  const related = useRelatedCase();
  const can = caseActions(c, me, role, S, related.openable);
  const isManager = role === "manager";
  const [picker, setPicker] = useState<"same" | "related" | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null); // the case a merge waits to be confirmed for
  const [note, setNote] = useState("");

  const ref = (r: Related) => r.title ?? t("loopCase.aCase");
  const lines: { key: string; text: string; to: string | null }[] = [];
  if (c.follows !== null) { const r = related.ofCase(c.follows); lines.push({ key: "f", text: t("caseSee.followsUp", { title: ref(r) }), to: r.to }); }
  for (const id of c.followedBy) { const r = related.ofCase(id); lines.push({ key: "b" + id, text: t("caseSee.followedBy", { title: ref(r) }), to: r.to }); }
  for (const id of c.links) { const r = related.ofCase(id); lines.push({ key: "l" + id, text: t("caseSee.relatedTo", { title: ref(r) }), to: r.to }); }
  if (c.mergedIn.length > 0) lines.push({ key: "m", text: t("caseSee.mergedIn", { count: c.mergedIn.length }), to: null });

  const same = can.maybeSame === null ? null : S.cases.find((x) => x.id === can.maybeSame) ?? null;
  const offers = can.merge || can.link;
  const candidates = !picker ? [] : S.cases
    .filter((x) => x.id !== c.id && related.openable(x.id) && (picker === "same" ? mayMerge(c, x, me, isManager) : mayLink(c, x, me, isManager)))
    .filter((x) => x.title.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, PICKER_ROWS);
  const target = pending === null ? null : S.cases.find((x) => x.id === pending) ?? null;

  const close = () => { setPicker(null); setQuery(""); setPending(null); setNote(""); };
  const merge = (into: string) => { act.merge(c.id, into, note.trim() || undefined); close(); showToast(t("loopCase.mergedDone")); };
  const link = (to: string) => { act.link(c.id, to); close(); showToast(t("loopCase.linkedDone")); };

  if (lines.length === 0 && !same && !offers) return null;
  return (
    <div className={styles.relations} data-testid="case-relations">
      {lines.map((l) => (
        <div key={l.key} className={styles.relation}>{l.to ? <Link href={l.to}>{l.text}</Link> : l.text}</div>
      ))}
      {same && offers && (
        <div className={styles.relation} data-testid="maybe-same">
          <span>{t("caseSee.maybeSame", { title: same.title })}</span>
          <span className={styles.relActions}>
            {can.merge && mayMerge(c, same, me, isManager) && <button type="button" className={styles.soft} onClick={() => { setPicker("same"); setPending(same.id); }}>{t("caseSee.mergeInto")}</button>}
            {can.link && mayLink(c, same, me, isManager) && <button type="button" className={styles.soft} onClick={() => link(same.id)}>{t("caseSee.linkRelated")}</button>}
          </span>
        </div>
      )}
      {offers && !picker && (
        <div className={styles.relActions}>
          {can.merge && <button type="button" className={styles.soft} data-testid="pick-same" onClick={() => setPicker("same")}>{t("caseSee.pickSame")}</button>}
          {can.link && <button type="button" className={styles.soft} data-testid="pick-related" onClick={() => setPicker("related")}>{t("caseSee.pickRelated")}</button>}
        </div>
      )}
      {picker && target === null && (
        <div className={styles.picker} role="group" aria-label={t(picker === "same" ? "caseSee.pickSame" : "caseSee.pickRelated")}>
          <input className={styles.note} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("loopCase.pickSearch")} aria-label={t("loopCase.pickSearch")} autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") close(); }} />
          {candidates.length === 0 && <span className={styles.small}>{t("loopCase.pickNone")}</span>}
          {candidates.map((x) => (
            <button key={x.id} type="button" className={styles.pickItem} onClick={() => (picker === "same" ? setPending(x.id) : link(x.id))}>{x.title}</button>
          ))}
          <button type="button" className={styles.soft} onClick={close}>{t("common.cancel")}</button>
        </div>
      )}
      {picker && target !== null && (
        <div className={styles.picker} role="group" aria-label={t("caseSee.mergeInto")}>
          <span className={styles.small}>{t("caseSee.mergedInto", { title: target.title })}</span>
          <label className={styles.label} htmlFor={"merge-note-" + c.id}>{t("caseSee.mergeNote")}</label>
          <input id={"merge-note-" + c.id} className={styles.note} value={note} maxLength={MERGE_NOTE_MAX} onChange={(e) => setNote(e.target.value)} autoFocus />
          <span className={styles.relActions}>
            <button type="button" className={styles.primary} data-testid="merge-confirm" onClick={() => merge(target.id)}>{t("caseSee.mergeInto")}</button>
            <button type="button" className={styles.soft} onClick={close}>{t("common.cancel")}</button>
          </span>
        </div>
      )}
    </div>
  );
}
