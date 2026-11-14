"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { FILES_UPLOAD_EVENT } from "@/features/files/upload";
import { startUploads } from "@/features/files/upload-run";
import { ut } from "@/features/files/upload";
import { useLocale, useT } from "@/i18n/client";
import { trailOf } from "./Breadcrumb";
import { uploadAccessAction } from "@/server/actions/project-files-upload";
import type { FilesPartProps } from "./types";
import styles from "./Upload.module.css";

type Access = "checking" | "ok" | "read-only" | "no-access" | "not-connected" | "offline";

/** The '+ Upload' menu (5.2): Upload files, Upload a folder, into the folder you're in. Also opens on the page header's upload event. */
export function UploadMenu({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { serverMode, persona, href } = useDemo();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState<Access>("checking");
  const open = state.dialog?.kind === "upload-menu";
  const { openDialog } = actions;
  const editor = state.editor;
  const projectId = state.p.id;

  useEffect(() => {
    if (!editor) return;
    const ask = () => openDialog({ kind: "upload-menu" });
    window.addEventListener(FILES_UPLOAD_EVENT, ask);
    return () => window.removeEventListener(FILES_UPLOAD_EVENT, ask);
  }, [editor, openDialog]);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    if (!serverMode) { void Promise.resolve().then(() => { if (!stale) setAccess("ok"); }); return () => { stale = true; }; }
    void uploadAccessAction(projectId).then((a) => { if (!stale) setAccess(a.state); });
    return () => { stale = true; };
  }, [open, serverMode, projectId]);

  const path = state.path.join("/");
  const name = state.path.at(-1) ?? trailOf(state.folder?.url).at(-1) ?? "";
  const pick = (list: FileList | null) => {
    const picked = list ? [...list] : [];
    actions.closeDialog();
    if (picked.length) void startUploads(picked, { projectId, path, demo: !serverMode, by: persona.who.name, landed: actions.reload });
  };
  const can = access === "ok";

  return <div data-testid="files-upload-menu">
    <input ref={files} type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
    <input ref={folder} type="file" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} {...{ webkitdirectory: "", directory: "" }} />
    {open && <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) actions.closeDialog(); }}>
      <div className={styles.menu} role="menu" aria-label={t("projectFiles.upload")} onKeyDown={(e) => { if (e.key === "Escape") actions.closeDialog(); }}>
        <span className={styles.head}>{t("projectFiles.uploadTo", { folder: name })}</span>
        <button type="button" role="menuitem" autoFocus disabled={!can} onClick={() => files.current?.click()}>{t("projectFiles.uploadFiles")}</button>
        <button type="button" role="menuitem" disabled={!can} onClick={() => folder.current?.click()}>{t("projectFiles.uploadFolder")}</button>
        {access === "read-only" && <p className={styles.hint}>{ut(locale, "connectAgain")}. {ut(locale, "connectAgainHint")} <a href={href("/profile")}>{ut(locale, "profile")}</a></p>}
        {access !== "ok" && access !== "checking" && access !== "read-only" && <p className={styles.hint}>{ut(locale, access === "not-connected" ? "why_not_connected" : access === "offline" ? "why_offline" : "why_no_access")}</p>}
      </div>
    </div>}
  </div>;
}
