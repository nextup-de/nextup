"use client";
// The preview's state (features/demo/preview/state.ts), kept in memory for as long as the visitor stays
// on the preview's pages, and the frame around every page: the note that this is a preview, the two
// pages of the path, the templates, and "Start over".
import { createContext, useContext, useReducer } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Banner } from "@/components/ui/elements";
import { PREVIEW_START, reducePreview, type PreviewAction, type PreviewState } from "@/features/demo/preview/state";
import { useT } from "@/i18n/client";
import styles from "./Preview.module.css";

const PreviewContext = createContext<{ s: PreviewState; send: (a: PreviewAction) => void } | null>(null);

export function usePreview() {
  const value = useContext(PreviewContext);
  if (!value) throw new Error("usePreview needs the PreviewProvider of app/demo/(app)/preview/layout.tsx");
  return value;
}

const PAGES = [["case", "preview.pathCase"], ["project", "preview.pathProject"], ["templates", "preview.pathTemplates"]] as const;

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [s, send] = useReducer(reducePreview, PREVIEW_START);
  const { href } = useDemo();
  const t = useT();
  const path = usePathname();
  return (
    <PreviewContext.Provider value={{ s, send }}>
      <div className={styles.page} data-wide="true">
        <Banner tone="quiet">{t("preview.banner")}</Banner>
        <nav className={styles.path} aria-label={t("preview.pathLabel")}>
          {PAGES.map(([page, key]) => (
            <Link key={page} href={href("/preview/" + page)} className={styles.pathLink} aria-current={path.endsWith("/preview/" + page) ? "page" : undefined}>{t(key)}</Link>
          ))}
          <button type="button" className={styles.quiet} onClick={() => send({ type: "reset" })}>{t("preview.startOver")}</button>
        </nav>
        {children}
      </div>
    </PreviewContext.Provider>
  );
}
