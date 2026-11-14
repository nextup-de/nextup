import type { FileKind } from "@/features/files/items";
import s from "./Files.module.css";

export type FileIconSize = 20 | 28 | 57 | 84;
const MARK: Record<Exclude<FileKind, "folder">, string> = { sheet: "X", pdf: "PDF", doc: "W", slides: "P", image: "", other: "" };

/** The Finder-style icon of a kind: a white page with a folded corner and a coloured mark; a folder is two-tone blue. */
export function FileIcon({ kind, size = 28 }: { kind: FileKind; size?: FileIconSize }) {
  if (kind === "folder") {
    return <svg className={s.icon} data-kind="folder" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <path className={s.folderBack} d="M2 7a2 2 0 0 1 2-2h6l2.5 2.5H24a2 2 0 0 1 2 2V22a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
      <path className={s.folderFront} d="M2 11a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
    </svg>;
  }
  const mark = MARK[kind];
  return <svg className={s.icon} data-kind={kind} width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <path className={s.page} d="M6 2h11l6 6v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
    <path className={s.corner} d="M17 2v4a2 2 0 0 0 2 2h4z" />
    {kind === "image"
      ? <path className={s.mark} d="M7 22l4-5 3 3 3-4 4 6z" />
      : <>
        <rect className={s.markBand} x="4" y="14" width="14" height="8" rx="1.5" />
        {mark && <text className={s.markText} x="11" y="20.2" textAnchor="middle">{mark}</text>}
      </>}
  </svg>;
}
