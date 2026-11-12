"use client";
// Editing an open idea the raise card's way (Paper "Idea · editing", P1-P3), inside the Overview's idea
// view (team/OverviewIdea). useIdeaEditor holds what is open and what is being written: double-click a
// part to edit that one (its own Cancel and Save), or Edit for all (one bar). IdeaSections draws the
// parts of the raise card in its order - Description, Affects, Context with the author's lines,
// Attachments - and Who last: set by the routing map and read only, with the system's lines. Nothing
// changes on hover; a double-click opens a part. Props in, JSX out; DashboardView saves.
import { Fragment, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { pageChanges, type IdeaContent, type IdeaFileRef, type Line, type PageChanges } from "@/features/ideas/edits";
import s from "./IdeaPage.module.css";

export type Part = "title" | "description" | "affects" | "context" | "files";
const PARTS: Part[] = ["title", "description", "affects", "context", "files"];
const PRESETS: MessageKey[] = ["ideas.cardPresetImpact", "ideas.cardPresetBlocked", "ideas.cardPresetTried", "ideas.cardPresetTrial", "ideas.cardPresetDeadline"];
type DraftLine = Line & { custom?: boolean };

/** Who: from the routing map, read only. `lines`: what the system knows (routed as, estimated worth, owner on the map, ...). */
export type IdeaWho = { raisedBy: string; team: string | null; routing: { name: string; role: string; why: string }[]; lines: Line[] };

export type IdeaEditor = ReturnType<typeof useIdeaEditor>;

export function useIdeaEditor(c: IdeaContent, onSave: ((changes: PageChanges) => void) | null) {
  const [open, setOpen] = useState<Set<Part>>(new Set());
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState<IdeaContent & { lines: DraftLine[] }>(c);
  const editing = (k: Part) => open.has(k);
  const begin = (...ks: Part[]) => {
    if (!onSave) return;
    // Opening a part takes its text as it stands now; parts already open keep what is being written.
    const fresh = (k: Part): Partial<IdeaContent> => (k === "context" ? { context: c.context, lines: c.lines } : ({ [k]: c[k] } as Partial<IdeaContent>));
    setDraft((d) => ({ ...(open.size ? d : c), ...Object.assign({}, ...ks.filter((k) => !open.has(k)).map(fresh)) }));
    setOpen((o) => new Set([...o, ...ks]));
  };
  const editAll = () => { setAll(true); begin(...PARTS); };
  const cancel = () => { setOpen(new Set()); setAll(false); };
  const changes = pageChanges(c, {
    ...(editing("title") ? { title: draft.title } : {}), ...(editing("description") ? { description: draft.description } : {}),
    ...(editing("affects") ? { affects: draft.affects } : {}), ...(editing("context") ? { context: draft.context, lines: draft.lines } : {}),
    ...(editing("files") ? { files: draft.files } : {}),
  });
  const dirty = Object.keys(changes).length > 0;
  const save = () => { if (onSave && dirty) onSave(changes); cancel(); };
  useEffect(() => {
    if (!open.size) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(new Set()); setAll(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open.size]);
  return { can: !!onSave, open, all, draft, setDraft, editing, begin, editAll, cancel, save, dirty, content: c };
}

/** A double-click opens the part (nothing changes on hover). */
const dbl = (ed: IdeaEditor, k: Part, hint: string) => (ed.can && !ed.editing(k) ? { title: hint, onDoubleClick: () => ed.begin(k) } : {});

/** Cancel and Save for a part opened on its own; with Edit (all) the bar on top has them. */
export function OwnButtons({ ed, part }: { ed: IdeaEditor; part: Part }) {
  const t = useT();
  if (!ed.editing(part) || ed.all) return null;
  return (
    <span className={s.own}>
      <button type="button" className={s.cancel} onClick={ed.cancel}>{t("team.ideaEditCancel")}</button>
      <button type="button" className={s.save} onClick={ed.save} disabled={!ed.dirty}>{t("team.ideaEditSave")}</button>
    </span>
  );
}

/** The title in the head card: the title, or its field once double-clicked (Enter saves). */
export function IdeaTitle({ ed, className }: { ed: IdeaEditor; className: string }) {
  const t = useT();
  if (!ed.editing("title")) return <h1 className={className} {...dbl(ed, "title", t("team.ideaDoubleClick"))}>{ed.content.title}</h1>;
  return (
    <div className={s.fieldWrap}>
      <textarea className={s.titleField} rows={1} value={ed.draft.title} autoFocus maxLength={200} aria-label={t("ideas.cardTitle")} placeholder={t("ideas.cardTitlePlaceholder")}
        onChange={(e) => ed.setDraft({ ...ed.draft, title: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!ed.all) ed.save(); } }} />
      <OwnButtons ed={ed} part="title" />
    </div>
  );
}

/** Next to Idea | AI: Edit, or while everything is open, the bar with Cancel and Save. */
export function EditControls({ ed, nextVersion }: { ed: IdeaEditor; nextVersion: number }) {
  const t = useT();
  if (!ed.can) return null;
  if (ed.all) {
    return (
      <span className={s.bar}>
        <span className={s.barNote}>{t("team.ideaEditingNote", { n: nextVersion })}</span>
        <button type="button" className={s.cancel} onClick={ed.cancel}>{t("team.ideaEditCancel")}</button>
        <button type="button" className={s.save} onClick={ed.save} disabled={!ed.dirty}>{t("team.ideaEditSave")}</button>
      </span>
    );
  }
  return <button type="button" className={s.editBtn} onClick={ed.editAll}><Pencil />{t("team.ideaEditButton")}</button>;
}

/** The idea's parts, in the raise card's order, and Who last. `whyOf`: why a team or person is affected (reading only). */
export function IdeaSections({ ed, who, depts, whyOf, after }: {
  ed: IdeaEditor; who: IdeaWho; depts: readonly string[]; whyOf: (name: string) => string | null;
  /** What follows Attachments before Who (the versions, what was added since). */
  after?: React.ReactNode;
}) {
  const t = useT();
  const c = ed.content, d = ed.draft;
  const [tray, setTray] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const hint = t("team.ideaDoubleClick");
  const setLine = (i: number, patch: Partial<DraftLine>) => ed.setDraft({ ...d, lines: d.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const used = d.lines.map((l) => l.label);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added: IdeaFileRef[] = [...list].map((f) => ({ name: f.name, ext: (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase(), meta: t("ideas.cardAttached") }));
    ed.setDraft({ ...d, files: [...d.files, ...added] });
  };
  const own = (k: Part) => ed.editing(k) && !ed.all || undefined;

  return (
    <div className={s.sections} data-all={ed.all || undefined}>
      {ed.editing("description") ? (
        <div className={s.fieldWrap}>
          <textarea className={s.descField} rows={2} value={d.description} autoFocus={!ed.editing("title")} aria-label={t("ideas.cardDescription")} placeholder={t("ideas.cardDescPlaceholder")}
            onChange={(e) => ed.setDraft({ ...d, description: e.target.value })} />
          <OwnButtons ed={ed} part="description" />
        </div>
      ) : <p className={s.desc} {...dbl(ed, "description", hint)}>{c.description}</p>}

      <section className={s.sec} data-tone="affects" data-open={own("affects")} {...dbl(ed, "affects", hint)}>
        <Head label={t("team.ideaAffects")}><OwnButtons ed={ed} part="affects" /></Head>
        {ed.editing("affects") ? (
          <>
            <div className={s.chips}>
              {d.affects.map((a) => <span key={a} className={s.chip}>{a}<X what={a} onClick={() => ed.setDraft({ ...d, affects: d.affects.filter((x) => x !== a) })} /></span>)}
              <button type="button" className={s.dashed} aria-expanded={tray} onClick={() => setTray(!tray)}><Plus />{t("ideas.cardAdd")}</button>
            </div>
            {tray && (
              <div className={s.tray}>
                {depts.filter((x) => !d.affects.includes(x)).map((x) => <button key={x} type="button" className={s.trayBtn} onClick={() => ed.setDraft({ ...d, affects: [...d.affects, x] })}><Plus />{x}</button>)}
              </div>
            )}
          </>
        ) : c.affects.length ? (
          // One row per team or person, with why it is affected where the analysis said so.
          <div className={s.tintList}>
            {c.affects.map((a) => (
              <div key={a} className={s.tintRow}><span className={s.tintChip}>{a}</span>{whyOf(a) && <span className={s.why}>{whyOf(a)}</span>}</div>
            ))}
          </div>
        ) : <span className={s.none}>{t("ideas.cardNoTeams")}</span>}
      </section>

      <section className={s.sec} data-tone="context" data-open={own("context")} {...dbl(ed, "context", hint)}>
        <Head label={t("team.ideaContext")}><OwnButtons ed={ed} part="context" /></Head>
        {ed.editing("context") ? (
          <>
            <textarea className={s.ctxField} rows={2} value={d.context} aria-label={t("team.ideaContext")} placeholder={t("ideas.cardContextPlaceholder")}
              autoFocus={!ed.all} onChange={(e) => ed.setDraft({ ...d, context: e.target.value })} />
            {d.lines.length > 0 && (
              <div className={s.lines}>
                {(d.lines as DraftLine[]).map((l, i) => (
                  <div key={i} className={s.line}>
                    {l.custom
                      ? <input className={s.lineLabelEdit} value={l.label} placeholder={t("ideas.cardLabel")} aria-label={t("ideas.cardLabel")} autoFocus={!l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
                      : <span className={s.lineLabel}>{l.label}</span>}
                    <textarea className={s.lineText} rows={1} value={l.text} placeholder={t("ideas.cardAddLine")} aria-label={l.label || t("ideas.cardLine")} autoFocus={!l.text && !l.custom && i === d.lines.length - 1}
                      onChange={(e) => setLine(i, { text: e.target.value })} />
                    <X what={l.label || t("ideas.cardThisLine")} onClick={() => ed.setDraft({ ...d, lines: d.lines.filter((_, k) => k !== i) })} />
                  </div>
                ))}
              </div>
            )}
            <div className={s.chips}>
              {PRESETS.map((k) => t(k)).filter((label) => !used.includes(label)).map((label) => (
                <button key={label} type="button" className={s.dashed} onClick={() => ed.setDraft({ ...d, lines: [...d.lines, { label, text: "" }] })}><Plus />{label}</button>
              ))}
              <button type="button" className={s.dashed} onClick={() => ed.setDraft({ ...d, lines: [...d.lines, { label: "", text: "", custom: true }] })}><Plus />{t("ideas.cardCustom")}</button>
            </div>
          </>
        ) : (
          <>
            {c.context && <p className={s.ctx}>{c.context}</p>}
            {c.lines.length > 0 && <Lines lines={c.lines} />}
            {!c.context && !c.lines.length && <span className={s.none}>{t("ideas.cardNothingAdded")}</span>}
          </>
        )}
      </section>

      <section className={s.sec} data-tone="files" data-open={own("files")} {...dbl(ed, "files", hint)}>
        <Head label={t("team.ideaAttachments")}><OwnButtons ed={ed} part="files" /></Head>
        <div className={s.files}>
          {(ed.editing("files") ? d.files : c.files).map((f, i) => (
            <span key={f.name + i} className={s.file}>
              <span className={s.ext} data-tone={f.ext === "XLSX" || f.ext === "CSV" ? "sheet" : f.ext === "PDF" ? "pdf" : /^(PNG|JPG|JPEG|IMG)$/.test(f.ext) ? "image" : undefined}>{f.ext}</span>
              <span className={s.fileText}><span className={s.fileName}>{f.name}</span><span className={s.fileSub}>{f.meta}</span></span>
              {ed.editing("files") && <X what={f.name} onClick={() => ed.setDraft({ ...d, files: d.files.filter((_, k) => k !== i) })} />}
            </span>
          ))}
          {!ed.editing("files") && !c.files.length && <span className={s.none}>{t("team.ideaNoAttachments")}</span>}
          {ed.editing("files") && <button type="button" className={s.addFile} onClick={() => fileInput.current?.click()}><Plus />{t("ideas.cardAddFile")}</button>}
          <input ref={fileInput} className={s.hidden} type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </section>

      {after}

      <section className={s.sec} data-tone="who" data-dim={ed.all || undefined}>
        <Head label={t("team.ideaWho")}><span className={s.locked}><Lock />{t("team.ideaRoutingMap")}</span></Head>
        <div className={s.tintLines}>
          <span className={s.tintLabel}>{t("team.ideaRaisedBy")}</span><span className={s.tintText}>{who.raisedBy}</span>
          {who.team && <><span className={s.tintLabel}>{t("team.ideaTeam")}</span><span className={s.tintText}>{who.team}</span></>}
          {who.routing.map((r, k) => (
            <Fragment key={r.name + k}>
              <span className={s.tintLabel}>{k === 0 ? t("team.ideaResponsible") : t("team.ideaNextInLine")}</span>
              <span className={s.tintText}>{r.name}{r.role ? " · " + r.role : ""}{r.why && <span className={s.why}>{r.why}</span>}</span>
            </Fragment>
          ))}
          {who.lines.map((l) => <Fragment key={l.label}><span className={s.tintLabel}>{l.label}</span><span className={s.tintText}>{l.text}</span></Fragment>)}
        </div>
      </section>
    </div>
  );
}

const Lines = ({ lines }: { lines: Line[] }) => (
  <div className={s.tintLines}>{lines.map((l, i) => <Fragment key={i}><span className={s.tintLabel}>{l.label}</span><span className={s.tintText}>{l.text}</span></Fragment>)}</div>
);
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
