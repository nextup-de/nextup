"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { importPlan, importedPageId } from "@/features/projects/page-undo";
import type { PageInput, ToolChange } from "@/components/dashboard/demo/project-acts";
import type { PageIconKey, ReducedProject, ToolKind } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { ideaPagesId, useProjectPages } from "../projectPagesPreview";
import { usePageActs } from "./usePageActs";
import s from "./BrowserPagesImport.module.css";

export type BrowserPagesImportProps = { p: ReducedProject; editor: boolean };

const importedKey = (company: string, projectId: string) => `nh.projectPagesImported.${company}.${projectId}`;
function readDone(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function writeDone(key: string, ids: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage off: the banner offers the page again */ }
}

/** Offers a team member the pages this browser kept (PGB D10). Copies them one by one; the browser's own pages stay. */
export function BrowserPagesImport({ p, editor }: BrowserPagesImportProps) {
  const t = useT();
  const { tenant } = useDemo();
  const acts = usePageActs(p);
  const from = p.sources[0] ? ideaPagesId(p.sources[0]) : null;
  const [browser] = useProjectPages(tenant.slug, p.id, from);
  const key = importedKey(tenant.slug, p.id);
  const [version, setVersion] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  void version;
  if (!editor || hidden || typeof window === "undefined") return null;
  const here = new Set((p.pages ?? []).map((page) => page.id));
  const plan = importPlan(p.id, browser.pages, readDone(key));
  const tooLong = plan.filter((step) => step.tooLong);
  const todo = plan.filter((step) => !step.tooLong);
  if (complete && todo.length === 0 && tooLong.length === 0) return <p className={s.banner} role="status">{t("projectPages.importComplete")}</p>;
  if (todo.length === 0 && tooLong.length === 0) return null;
  const titleOf = (browserId: string) => browser.pages.find((page) => page.id === browserId)?.title ?? browserId;
  const exists = (error: string) => error.includes(t("projectPages.permPageExists"));

  const run = async () => {
    setBusy(true); setFailure(null);
    const done = readDone(key);
    for (const step of todo) {
      const [added, ...rest] = step.events;
      const pageId = importedPageId(p.id, step.browserId);
      let ok = here.has(pageId);
      if (!ok) {
        const payload = added.payload as { pageId: string; title: string; icon: PageIconKey; tools: { kind: ToolKind; title?: string; content?: string; toolId: string }[] };
        const input: PageInput = { pageId: payload.pageId, title: payload.title, icon: payload.icon, tools: payload.tools };
        const result = await acts.create(input);
        if (!result.ok && !exists(result.error)) { setFailure(t("projectPages.importFailed", { page: titleOf(step.browserId), error: result.error })); setBusy(false); return; }
        ok = true;
        for (const event of rest) {
          const edit = event.payload as { toolId: string } & ToolChange;
          const { toolId, ...change } = edit;
          const edited = await acts.editTool(toolId, change);
          // Content that is already there (a retry) is stale at baseRev 0; the page itself counts as brought over.
          if (!edited.ok) { setFailure(t("projectPages.importFailed", { page: titleOf(step.browserId), error: edited.error })); setBusy(false); return; }
        }
      }
      if (ok) { done.push(step.browserId); writeDone(key, done); setVersion((v) => v + 1); }
    }
    setBusy(false); setComplete(true);
  };

  return <div className={s.banner} role="region" aria-label={t("projectPages.importPages")}>
    {todo.length > 0 && <>
      <strong>{t("projectPages.importBanner", { count: todo.length })}</strong>
      <span className={s.hint}>{t("projectPages.importHint")}</span>
    </>}
    {tooLong.map((step) => <span key={step.browserId} className={s.hint}>{t("projectPages.importTooLong", { page: titleOf(step.browserId) })}</span>)}
    {failure && <span className={s.error} role="alert">{failure}</span>}
    {todo.length > 0 && <span className={s.actions}>
      <button type="button" className={s.primary} disabled={busy} aria-busy={busy || undefined} onClick={() => void run()}>{busy ? t("projectPages.importing") : failure ? t("projectPages.tryAgain") : t("projectPages.importPages")}</button>
      <button type="button" disabled={busy} onClick={() => setHidden(true)}>{t("projectPages.notNow")}</button>
    </span>}
  </div>;
}
