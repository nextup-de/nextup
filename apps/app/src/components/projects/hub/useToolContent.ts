"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject, ToolInstance } from "@/features/projects/types";
import { readContent, roomLeft, saveState, writeContent, type ContentKind, type SaveState, type ToolContent } from "@/features/projects/tool-content";
import { useT } from "@/i18n/client";
import { useRights } from "../parts";

type LeavingEditor = { flush: () => Promise<boolean>; pending: () => boolean; question: () => string };
const editors = new Set<LeavingEditor>();
function beforeUnload(event: BeforeUnloadEvent) {
  if ([...editors].some((editor) => editor.pending())) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function pageHide() { for (const editor of editors) void editor.flush(); }
function beforeNavigate(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.href === location.href || !["http:", "https:"].includes(anchor.protocol)) return;
  if (![...editors].some((editor) => editor.pending())) return;
  event.preventDefault();
  event.stopPropagation();
  const current = [...editors];
  void Promise.all(current.map((editor) => editor.flush())).then((results) => {
    if (results.every(Boolean) || window.confirm(current[0].question())) location.assign(anchor.href);
  });
}

/** The draft and its base revision stay together until the server acknowledges that exact draft. */
export function useToolContent<K extends ContentKind>(p: ReducedProject, tool: ToolInstance, kind: K = tool.kind as K) {
  const { act } = useDemo();
  const editor = useRights(p).addStep;
  const router = useRouter();
  const t = useT();
  const [reloading, startReload] = useTransition();
  const [draft, render] = useState(() => ({ value: readContent(kind, tool.content), baseRev: tool.rev, state: "idle" as SaveState }));
  const current = useRef(draft);
  const latest = useRef({ tool, act, editor, router, t });
  useEffect(() => { latest.current = { tool, act, editor, router, t }; });
  const update = useCallback((next: typeof draft) => { current.current = next; render(next); }, []);
  const request = useRef<Promise<boolean> | null>(null);
  const flush = useCallback(async function flush(): Promise<boolean> {
    if (request.current) {
      const ok = await request.current;
      return ok && current.current.state === "dirty" ? flush() : ok && !["dirty", "failed", "stale"].includes(current.current.state);
    }
    const snapshot = current.current;
    if (["idle", "saved"].includes(snapshot.state)) return true;
    if (!latest.current.editor || snapshot.state === "stale") return false;
    const content = writeContent(kind, snapshot.value);
    if (roomLeft(tool.id, content, snapshot.baseRev) < 0) return false;
    update({ ...snapshot, state: saveState(snapshot.state, "save") });
    const saving = (async () => {
      try {
        const result = await latest.current.act.project.page.editTool(p.id, tool.id, { content, baseRev: snapshot.baseRev });
        const now = current.current;
        if (!result.ok) {
          const stale = result.error === "projectPages.permToolStale" || result.error === latest.current.t("projectPages.permToolStale");
          update({ ...now, state: stale ? "stale" : "failed" });
          if (stale) startReload(() => latest.current.router.refresh());
          return false;
        }
        update({ ...now, baseRev: snapshot.baseRev + 1, state: writeContent(kind, now.value) === content ? "saved" : "dirty" });
        return true;
      } catch {
        update({ ...current.current, state: "failed" });
        return false;
      } finally { request.current = null; }
    })();
    request.current = saving;
    const ok = await saving;
    return ok && current.current.state === "dirty" ? flush() : ok;
  }, [kind, p.id, tool.id, startReload, update]);

  useEffect(() => {
    const timer = draft.state === "dirty" ? setTimeout(() => { void flush(); }, 3000) : null;
    return () => { if (timer) clearTimeout(timer); };
  }, [draft, flush]);
  useEffect(() => {
    // A refreshed server copy may replace a clean draft, never a local edit or an in-flight save.
    if (["idle", "saved"].includes(current.current.state) && tool.rev > current.current.baseRev) {
      update({ value: readContent(kind, tool.content), baseRev: tool.rev, state: "idle" });
    }
  }, [kind, tool.content, tool.rev, update]);
  useEffect(() => {
    const entry: LeavingEditor = {
      flush,
      pending: () => !["idle", "saved"].includes(current.current.state),
      question: () => latest.current.t("projectHub.docSaveLeave"),
    };
    if (!editors.size) {
      window.addEventListener("beforeunload", beforeUnload);
      window.addEventListener("pagehide", pageHide);
      document.addEventListener("click", beforeNavigate, true);
    }
    editors.add(entry);
    return () => {
      void flush();
      editors.delete(entry);
      if (!editors.size) {
        window.removeEventListener("beforeunload", beforeUnload);
        window.removeEventListener("pagehide", pageHide);
        document.removeEventListener("click", beforeNavigate, true);
      }
    };
  }, [flush]);

  const setValue = (value: ToolContent[K]) => {
    if (editor) update({ ...current.current, value, state: saveState(current.current.state, "edit") });
  };
  const showTheirs = () => {
    const theirs = latest.current.tool;
    update({ value: readContent(kind, theirs.content), baseRev: theirs.rev, state: "idle" });
  };
  const keepMine = () => {
    update({ ...current.current, baseRev: latest.current.tool.rev, state: "dirty" });
    void flush();
  };
  const changedBy = p.history.slice().reverse().find((event) => event.type === "project.tool.edited" && event.payload.toolId === tool.id)?.actor;
  return { value: draft.value, setValue, editor, state: draft.state, flush, showTheirs, keepMine, changedBy, reloading, remaining: roomLeft(tool.id, writeContent(kind, draft.value), draft.baseRev) };
}
