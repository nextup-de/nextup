"use client";
// The NextUp AI side chat on a project's pages (Paper "Project · AI side chat", v2): closed, a tab on the right
// edge shows a corner of the NextUp star like an arrow to pull; on hover the tab comes out a little further.
// Open, the chat is a column on the right, flush with the screen edge, and the page makes room for it.
// UI only for now: only open and close work; the suggestions, Attach and Send do nothing yet (PROJECT-AI-FOR-KEVIN.txt).
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import s from "./ProjectAi.module.css";

/** The tab or the open chat. Closing plays the panel out first, then hands back to the tab. */
export function ProjectAi({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  if (!open) return <ProjectAiTab onOpen={() => setOpen(true)} />;
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = window.setTimeout(() => { setClosing(false); setOpen(false); }, 300);
  };
  return <div className={s.col} data-closing={closing}><ProjectAiPanel onClose={close} /></div>;
}

/** The closed tab. */
function ProjectAiTab({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  return (
    <button type="button" className={s.tab} onClick={onOpen} title={t("projects.aiOpen")} aria-label={t("projects.aiOpen")} data-testid="project-ai-tab">
      <span className={s.tabStar} aria-hidden="true" />
    </button>
  );
}

/** The open chat column. */
function ProjectAiPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const acts = [t("projects.aiActUpdate"), t("projects.aiActChase"), t("projects.aiActFile")];

  return (
    <section className={s.panel} aria-label={t("projects.aiTitle")} data-testid="project-ai-panel"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <header className={s.head}>
        <span className={s.logo} aria-hidden="true" />
        <h2 className={s.title}>{t("projects.aiTitle")}</h2>
        <button type="button" className={s.close} onClick={onClose} title={t("projects.aiClose")} aria-label={t("projects.aiClose")}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className={s.body}>
        <div className={s.intro}>
          <p className={s.heading}>{t("projects.aiHeading")}</p>
          <p className={s.lead}>{t("projects.aiLead")}</p>
        </div>
        <ul className={s.acts}>
          {acts.map((a) => (
            <li key={a}><button type="button" className={s.act}>{a}</button></li>
          ))}
        </ul>
      </div>

      <form className={s.foot} onSubmit={(e) => e.preventDefault()}>
        <div className={s.composer}>
          <span className={s.soon}>{t("projects.aiSoon")}</span>
          <textarea tabIndex={-1} disabled className={s.input} rows={2} placeholder={t("projects.aiPlaceholder")} aria-label={t("projects.aiPlaceholder")} />
          <div className={s.tools}>
            <button type="button" className={s.attach} disabled tabIndex={-1}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 1.5h5l3.5 3.5v9.5H4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9 1.5V5h3.5M6 8.5h4M6 11h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {t("projects.aiAttach")}
            </button>
            <button type="submit" className={s.send} disabled tabIndex={-1} aria-label={t("projects.aiSend")} title={t("projects.aiSend")}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
