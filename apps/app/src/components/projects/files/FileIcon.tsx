import type { FileKind } from "@/features/files/items";
import s from "./Files.module.css";

export type FileIconSize = 20 | 28 | 30 | 34 | 57 | 84;

/** The page every file kind sits on (Paper "Files · 3": a white page, a folded corner, a soft drop shadow). */
const PAGE = <>
  <path className={s.page} d="M8 2.5h11l6.5 6.5v19a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 8 2.5z" />
  <path className={s.corner} d="M19 2.5v5a1.5 1.5 0 0 0 1.5 1.5h5z" />
</>;

/** Each kind's mark on the page, 1:1 with the Paper icons (D3: the colours are local to Files.module.css). */
const MARK: Record<Exclude<FileKind, "folder">, React.ReactNode> = {
  sheet: <>
    <rect className={s.sheet} x="10" y="13" width="12" height="10" rx="1.5" />
    <path className={s.cut} strokeWidth="0.9" d="M10 16.4h12M10 19.7h12M14.5 13v10" />
  </>,
  pdf: <>
    <path className={s.lines} strokeWidth="1.2" strokeLinecap="round" d="M10.5 12.5h11M10.5 15h8" />
    <rect className={s.pdf} x="9.5" y="18" width="13" height="7" rx="2" />
    <path className={s.cut} strokeWidth="1.4" strokeLinecap="round" d="M12.5 21.5h7" />
  </>,
  doc: <path className={s.doc} strokeWidth="1.6" strokeLinecap="round" d="M10.5 13h11M10.5 16h11M10.5 19h11M10.5 22h7" />,
  slides: <>
    <rect className={s.slides} x="9.5" y="12.5" width="13" height="8.5" rx="1.5" />
    <path className={s.cut} strokeWidth="1.2" strokeLinecap="round" d="M12 15.5h5M12 18h8" />
    <path className={s.slidesStand} strokeWidth="1.5" strokeLinecap="round" d="M14 24h4" />
  </>,
  image: <>
    <rect className={s.imageBack} x="9.5" y="12.5" width="13" height="11" rx="1.5" />
    <circle className={s.image} cx="13" cy="15.8" r="1.4" />
    <path className={s.image} d="M9.5 22l4-4.2 2.6 2.6 2-1.8 4.4 4.1v.3a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5z" />
  </>,
  other: <path className={s.lines} strokeWidth="1.2" strokeLinecap="round" d="M10.5 13h11M10.5 16h11M10.5 19h8" />,
};

/** The Finder-style icon of a kind: a white page with a folded corner and a coloured mark; a folder is two-tone blue. */
export function FileIcon({ kind, size = 30 }: { kind: FileKind; size?: FileIconSize }) {
  return <svg className={s.icon} data-kind={kind} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    {kind === "folder"
      ? <>
        <path className={s.folderBack} d="M3 9a2 2 0 0 1 2-2h7l2.5 2.5H27a2 2 0 0 1 2 2V25a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path className={s.folderFront} d="M3 13a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </>
      : <>{PAGE}{MARK[kind]}</>}
  </svg>;
}
