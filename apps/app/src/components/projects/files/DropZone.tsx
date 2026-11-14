"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { startUploads } from "@/features/files/upload-run";
import { useT } from "@/i18n/client";
import { trailOf } from "./Breadcrumb";
import type { FilesPartProps } from "./types";
import styles from "./Upload.module.css";

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

/** Dropping files on the page (3.3): the card says where they will land; the drop starts the uploads into the open folder. */
export function DropZone({ state, actions }: FilesPartProps) {
  const t = useT();
  const { serverMode, persona } = useDemo();
  const [count, setCount] = useState<number | null>(null);
  const depth = useRef(0);
  const live = useRef({ state, actions, serverMode, by: persona.who.name });
  useEffect(() => { live.current = { state, actions, serverMode, by: persona.who.name }; });
  const armed = state.editor && !!state.folder;

  useEffect(() => {
    if (!armed) return;
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current++; setCount(e.dataTransfer?.items.length || 1); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setCount(null); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth.current = 0; setCount(null);
      const dropped = e.dataTransfer ? [...e.dataTransfer.files] : [];
      const { state: s, actions: a, serverMode: server, by } = live.current;
      if (dropped.length) void startUploads(dropped, { projectId: s.p.id, path: s.path.join("/"), demo: !server, by, landed: a.reload });
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [armed]);

  const name = state.path.at(-1) ?? trailOf(state.folder?.url).at(-1) ?? "";
  return <div data-testid="files-drop-zone">
    {count !== null && <div className={styles.drop} role="status">
      <div className={styles.dropCard}>
        <strong>{t("projectFiles.dropTo", { folder: name })}</strong>
        <span>{t("projectFiles.dropSub", { count })}</span>
      </div>
    </div>}
  </div>;
}
