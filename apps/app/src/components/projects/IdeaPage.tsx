"use client";
// An idea in the projects frame (Paper "Idea · editing", P1-P3): laid out like a project page - its title,
// one line of where it stands, then the parts of the raise card in the raise card's order (Description,
// Affects, Context with the author's lines, Attachments) and Who last, set by the routing map and read
// only. The people on it edit it the raise page's way: double-click a part to edit that one (its own
// Cancel and Save), or Edit for all of it (one bar on top). Props in, JSX out; DashboardView saves.
import { Fragment, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { pageChanges, type IdeaContent, type IdeaFileRef, type Line, type PageChanges } from "@/features/ideas/edits";
import s from "./IdeaPage.module.css";

type Part = "title" | "description" | "affects" | "context" | "files";
const PARTS: Part[] = ["title", "description", "affects", "context", "files"];
const PRESETS: MessageKey[] = ["ideas.cardPresetImpact", "ideas.cardPresetBlocked", "ideas.cardPresetTried", "ideas.cardPresetTrial", "ideas.cardPresetDeadline"];

export type IdeaPageProps = {
  content: IdeaContent;
  /** "Raised 8 Nov · Body & Assembly · Team lead · 2 d of the 5-day promise" */
  meta: string;
  who: { raisedBy: string; team: string | null; routing: { name: string; role: string; why: string }[] };
  /** The teams the Affects tray offers. */
  depts: readonly string[];
  /** The version the title and text would go out as. */
  nextVersion: number;
  /** The people on it, before the decision (null: read only). */
  edit: { onSave: (changes: PageChanges) => void } | null;
};

export function IdeaPage(p: IdeaPageProps) {
  const t = useT();
  const c = p.content;
  // Editing: the parts open (one by double-click, all by Edit) and what is being written.
  const [open, setOpen] = useState<Set<Part>>(new Set());
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState<IdeaContent>(c);
  const [tray, setTray] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = (k: Part) => open.has(k);
  const begin = (...ks: Part[]) => {
    if (!p.edit) return;
    // Opening a part takes its text as it stands now; parts already open keep what is being written.
    const fresh = (k: Part): Partial<IdeaContent> => (k === "context" ? { context: c.context, lines: c.lines } : ({ [k]: c[k] } as Partial<IdeaContent>));
    setDraft((d) => ({ ...(open.size ? d : c), ...Object.assign({}, ...ks.filter((k) => !open.has(k)).map(fresh)) }));
    setOpen((o) => new Set([...o, ...ks]));
  };
  const cancel = () => { setOpen(new Set()); setAll(false); setTray(false); };
  const changes = pageChanges(c, {
    ...(editing("title") ? { title: draft.title } : {}), ...(editing("description") ? { description: draft.description } : {}),
    ...(editing("affects") ? { affects: draft.affects } : {}), ...(editing("context") ? { context: draft.context, lines: draft.lines } : {}),
    ...(editing("files") ? { files: draft.files } : {}),
  });
  const dirty = Object.keys(changes).length > 0;
  const save = () => { if (p.edit && dirty) p.edit.onSave(changes); cancel(); };
  useEffect(() => {
    if (!open.size) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open.size]);
  const hint = p.edit ? t("team.ideaDoubleClick") : undefined;
  const dbl = (k: Part) => (p.edit && !editing(k) ? { "data-editable": "true", title: hint, onDoubleClick: () => begin(k) } : {});
  // A part opened on its own gets its own Cancel and Save; with Edit (all) there is one bar on top.
  const ownButtons = (k: Part) => editing(k) && !all && (
    <span className={s.own}>
      <button type="button" className={s.cancel} onClick={cancel}>{t("team.ideaEditCancel")}</button>
      <button type="button" className={s.save} onClick={save} disabled={!dirty}>{t("team.ideaEditSave")}</button>
    </span>
  );
  const setLine = (i: number, patch: Partial<Line & { custom?: boolean }>) => setDraft((d) => ({ ...d, lines: d.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const usedLabels = draft.lines.map((l) => l.label);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added: IdeaFileRef[] = [...list].map((f) => ({ name: f.name, ext: (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase(), meta: t("ideas.cardAttached") }));
    setDraft((d) => ({ ...d, files: [...d.files, ...added] }));
  };

  return (
    <article className={s.page} data-all={all || undefined}>
      {all && (
        <div className={s.bar}>
          <span className={s.barTitle}><Pencil />{t("team.ideaEditing")}</span>
          <span className={s.barNote}>· {t("team.ideaEditingNote", { n: p.nextVersion })}</span>
          <span className={s.grow} />
          <button type="button" className={s.cancel} onClick={cancel}>{t("team.ideaEditCancel")}</button>
          <button type="button" className={s.save} onClick={save} disabled={!dirty}>{t("team.ideaEditSave")}</button>
        </div>
      )}

      {editing("title") ? (
        <div className={s.fieldWrap}>
          <textarea className={s.titleField} rows={1} value={draft.title} autoFocus maxLength={200} aria-label={t("ideas.cardTitle")} placeholder={t("ideas.cardTitlePlaceholder")}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!all) save(); } }} />
          {ownButtons("title")}
        </div>
      ) : <h1 className={s.title} {...dbl("title")}>{c.title}</h1>}

      {!all && (
        <div className={s.metaRow}>
          <span className={s.meta}>{p.meta}</span>
          <span className={s.grow} />
          {p.edit && <button type="button" className={s.editBtn} onClick={() => { setAll(true); begin(...PARTS); }}><Pencil />{t("team.ideaEditButton")}</button>}
        </div>
      )}

      {editing("description") ? (
        <div className={s.fieldWrap}>
          <textarea className={s.descField} rows={2} value={draft.description} autoFocus={!editing("title")} aria-label={t("ideas.cardDescription")} placeholder={t("ideas.cardDescPlaceholder")}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          {ownButtons("description")}
        </div>
      ) : <p className={s.desc} {...dbl("description")}>{c.description}</p>}

      <section className={s.sec} data-tone="affects" data-open={editing("affects") && !all || undefined} {...dbl("affects")}>
        <Head label={t("team.ideaAffects")}>{ownButtons("affects")}</Head>
        {editing("affects") ? (
          <>
            <div className={s.chips}>
              {draft.affects.map((a) => (
                <span key={a} className={s.chip}>{a}<X what={a} onClick={() => setDraft({ ...draft, affects: draft.affects.filter((x) => x !== a) })} /></span>
              ))}
              <button type="button" className={s.dashed} aria-expanded={tray} onClick={() => setTray(!tray)}><Plus />{t("ideas.cardAdd")}</button>
            </div>
            {tray && (
              <div className={s.tray}>
                {p.depts.filter((d) => !draft.affects.includes(d)).map((d) => (
                  <button key={d} type="button" className={s.trayBtn} onClick={() => setDraft({ ...draft, affects: [...draft.affects, d] })}><Plus />{d}</button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={s.tintChips}>
            {c.affects.length ? c.affects.map((a) => <span key={a} className={s.tintChip}>{a}</span>) : <span className={s.none}>{t("ideas.cardNoTeams")}</span>}
          </div>
        )}
      </section>

      <section className={s.sec} data-tone="context" data-open={editing("context") && !all || undefined} {...dbl("context")}>
        <Head label={t("team.ideaContext")}>{ownButtons("context")}</Head>
        {editing("context") ? (
          <>
            <textarea className={s.ctxField} rows={2} value={draft.context} aria-label={t("team.ideaContext")} placeholder={t("ideas.cardContextPlaceholder")}
              autoFocus={!editing("title") && !editing("description") && !editing("affects")} onChange={(e) => setDraft({ ...draft, context: e.target.value })} />
            {draft.lines.length > 0 && (
              <div className={s.lines}>
                {draft.lines.map((l, i) => (
                  <div key={i} className={s.line}>
                    {(l as Line & { custom?: boolean }).custom
                      ? <input className={s.lineLabelEdit} value={l.label} placeholder={t("ideas.cardLabel")} aria-label={t("ideas.cardLabel")} autoFocus={!l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
                      : <span className={s.lineLabel}>{l.label}</span>}
                    <textarea className={s.lineText} rows={1} value={l.text} placeholder={t("ideas.cardAddLine")} aria-label={l.label || t("ideas.cardLine")} autoFocus={!l.text && !(l as Line & { custom?: boolean }).custom && i === draft.lines.length - 1}
                      onChange={(e) => setLine(i, { text: e.target.value })} />
                    <X what={l.label || t("ideas.cardThisLine")} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, k) => k !== i) })} />
                  </div>
                ))}
              </div>
            )}
            <div className={s.chips}>
              {PRESETS.map((k) => t(k)).filter((label) => !usedLabels.includes(label)).map((label) => (
                <button key={label} type="button" className={s.dashed} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { label, text: "" }] })}><Plus />{label}</button>
              ))}
              <button type="button" className={s.dashed} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { label: "", text: "", custom: true } as Line] })}><Plus />{t("ideas.cardCustom")}</button>
            </div>
          </>
        ) : (
          <>
            {c.context && <p className={s.ctx}>{c.context}</p>}
            {c.lines.length > 0 && (
              <div className={s.tintLines}>
                {c.lines.map((l, i) => <Fragment key={i}><span className={s.tintLabel}>{l.label}</span><span className={s.tintText}>{l.text}</span></Fragment>)}
              </div>
            )}
            {!c.context && !c.lines.length && <span className={s.none}>{t("ideas.cardNothingAdded")}</span>}
          </>
        )}
      </section>

      <section className={s.sec} data-tone="files" data-open={editing("files") && !all || undefined} {...dbl("files")}>
        <Head label={t("team.ideaAttachments")}>{ownButtons("files")}</Head>
        <div className={s.files}>
          {(editing("files") ? draft.files : c.files).map((f, i) => (
            <span key={f.name + i} className={s.file}>
              <span className={s.ext} data-tone={f.ext === "XLSX" || f.ext === "CSV" ? "sheet" : f.ext === "PDF" ? "pdf" : /^(PNG|JPG|JPEG|IMG)$/.test(f.ext) ? "image" : undefined}>{f.ext}</span>
              <span className={s.fileText}><span className={s.fileName}>{f.name}</span><span className={s.fileSub}>{f.meta}</span></span>
              {editing("files") && <X what={f.name} onClick={() => setDraft({ ...draft, files: draft.files.filter((_, k) => k !== i) })} />}
            </span>
          ))}
          {!editing("files") && !c.files.length && <span className={s.none}>{t("ideas.cardNone")}</span>}
          {editing("files") && (
            <button type="button" className={s.addFile} onClick={() => fileInput.current?.click()}><Plus />{t("ideas.cardAddFile")}</button>
          )}
          <input ref={fileInput} className={s.hidden} type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </section>

      <section className={s.sec} data-tone="who" data-dim={all || undefined}>
        <Head label={t("team.ideaWho")}><span className={s.locked}><Lock />{t("team.ideaRoutingMap")}</span></Head>
        <div className={s.tintLines}>
          <span className={s.tintLabel}>{t("team.ideaRaisedBy")}</span><span className={s.tintText}>{p.who.raisedBy}{p.who.team ? " · " + p.who.team : ""}</span>
          {p.who.routing.map((r, k) => (
            <Fragment key={r.name + k}>
              <span className={s.tintLabel}>{k === 0 ? t("team.ideaResponsible") : t("team.ideaNextInLine")}</span>
              <span className={s.tintText}>{r.name}{r.role ? " · " + r.role : ""}</span>
            </Fragment>
          ))}
          {c.routedAs && <><span className={s.tintLabel}>{t("team.ideaRoutedAs")}</span><span className={s.tintText}>{c.routedAs}</span></>}
          {c.worth && <><span className={s.tintLabel}>{t("team.ideaWorth")}</span><span className={s.tintText}>{c.worth}</span></>}
        </div>
      </section>
    </article>
  );
}

const Head = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <div className={s.head}><span className={s.dot} /><span className={s.headLabel}>{label}</span><span className={s.grow} />{children}</div>
);
const Plus = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Pencil = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>;
const Lock = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2" /><path d="M4 5.5V4C4 2.9 4.9 2 6 2C7.1 2 8 2.9 8 4V5.5" /></svg>;
function X({ what, onClick }: { what: string; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" className={s.x} onClick={onClick} title={t("ideas.cardRemove")} aria-label={t("ideas.cardRemoveWhat", { what })}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}
