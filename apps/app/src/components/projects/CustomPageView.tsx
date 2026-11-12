"use client";
// A page the people of a project or an idea added from the sidebar (?page=): notes, a checklist, a table or
// a link. They edit it in place; viewers read it. Stand-in storage (projectPagesPreview.ts).
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { updatePage, type CustomPage } from "@/features/projects/sidebar";
import { useT } from "@/i18n/client";
import { PageGlyph } from "./ProjectsSidebar";
import { useProjectPages } from "./projectPagesPreview";
import s from "./CustomPageView.module.css";

const webUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

/** `storeId`/`from`: whose pages (projectPagesPreview.ts); `editor`: added and not only a viewer. */
export function CustomPageView({ storeId, from = null, page, editor }: { storeId: string; from?: string | null; page: CustomPage; editor: boolean }) {
  const { tenant } = useDemo();
  const t = useT();
  const [, setPages] = useProjectPages(tenant.slug, storeId, from);
  const save = (patch: Partial<Omit<CustomPage, "id" | "kind">>) => setPages((st) => updatePage(st, page.id, patch));

  return (
    <section className={s.page} aria-label={page.title}>
      <div className={s.head}>
        <span className={s.glyph}><PageGlyph icon={page.icon} /></span>
        <h2 className={s.title}>{page.title}</h2>
        <span className={s.note}>{t("projects.pgLocal")}</span>
      </div>
      {page.kind === "page" && <Notes page={page} editor={editor} save={save} />}
      {page.kind === "checklist" && <Checklist page={page} editor={editor} save={save} />}
      {page.kind === "table" && <Table page={page} editor={editor} save={save} />}
      {page.kind === "link" && <LinkPage page={page} editor={editor} save={save} />}
    </section>
  );
}

type Part = { page: CustomPage; editor: boolean; save: (patch: Partial<Omit<CustomPage, "id" | "kind">>) => void };

function Notes({ page, editor, save }: Part) {
  const t = useT();
  if (!editor) return page.body.trim() ? <p className={s.body}>{page.body}</p> : <p className={s.empty}>{t("projects.pgEmpty")}</p>;
  return <textarea className={s.notes} value={page.body} onChange={(e) => save({ body: e.target.value })} placeholder={t("projects.pgNotes")} aria-label={page.title} />;
}

function Checklist({ page, editor, save }: Part) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    save({ items: [...page.items, { id: "i" + Date.now().toString(36), text: draft.trim(), done: false }] });
    setDraft("");
  };
  return (
    <div className={s.list}>
      {page.items.map((it) => (
        <label key={it.id} className={s.check} data-done={it.done}>
          <input type="checkbox" checked={it.done} disabled={!editor} onChange={() => save({ items: page.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) })} />
          <span className={s.checkText}>{it.text}</span>
          {editor && (
            <button type="button" className={s.x} aria-label={t("projects.pgRemoveItem", { item: it.text })} onClick={(e) => { e.preventDefault(); save({ items: page.items.filter((x) => x.id !== it.id) }); }}>×</button>
          )}
        </label>
      ))}
      {!editor && !page.items.length && <p className={s.empty}>{t("projects.pgEmpty")}</p>}
      {editor && (
        <form className={s.addRow} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("projects.pgItem")} aria-label={t("projects.pgItem")} />
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!draft.trim()}>{t("projects.pgAddItem")}</button>
        </form>
      )}
    </div>
  );
}

function Table({ page, editor, save }: Part) {
  const t = useT();
  const cols = Math.max(1, ...page.rows.map((r) => r.length));
  const set = (ri: number, ci: number, v: string) => save({ rows: page.rows.map((r, i) => (i === ri ? Array.from({ length: cols }, (_, c) => (c === ci ? v : r[c] ?? "")) : r)) });
  return (
    <div className={s.tableWrap}>
      <div className={s.table} style={{ "--cols": cols } as React.CSSProperties} role="table" aria-label={page.title}>
        {page.rows.map((r, ri) => (
          <div key={ri} className={s.tr} role="row" data-head={ri === 0}>
            {Array.from({ length: cols }, (_, ci) => (
              <div key={ci} className={s.td} role={ri === 0 ? "columnheader" : "cell"}>
                {editor
                  ? <input className={s.cell} value={r[ci] ?? ""} onChange={(e) => set(ri, ci, e.target.value)} aria-label={t("projects.pgCell", { row: ri + 1, col: ci + 1 })} />
                  : <span className={s.cellText}>{r[ci] ?? ""}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {editor && <button type="button" className={s.quiet} onClick={() => save({ rows: [...page.rows, Array.from({ length: cols }, () => "")] })}>+ {t("projects.pgAddRow")}</button>}
    </div>
  );
}

function LinkPage({ page, editor, save }: Part) {
  const t = useT();
  const ok = webUrl(page.url);
  return (
    <div className={s.addRow}>
      {editor
        ? <input className={s.input} value={page.url} onChange={(e) => save({ url: e.target.value })} placeholder={t("projects.pgUrl")} aria-label={t("projects.pgUrl")} inputMode="url" />
        : <span className={ok ? s.url : s.empty}>{ok ? page.url : t("projects.pgEmpty")}</span>}
      {ok && <a className="nh-btn nh-btn-primary nh-btn-sm" href={page.url.trim()} target="_blank" rel="noreferrer noopener">{t("projects.pgOpen")}</a>}
    </div>
  );
}

/** An idea's files (the projects sidebar's "Files" page): what was attached when it was raised, then the screenshots kept in this browser. */
export function FilesCard({ title, files, empty }: { title: string; files: { name: string; ext: string; meta: string }[]; empty: string }) {
  return (
    <section className={s.page} aria-label={title}>
      <div className={s.head}>
        <span className={s.glyph}><PageGlyph icon="box" /></span>
        <h2 className={s.title}>{title}</h2>
        <span className={s.count}>{files.length}</span>
      </div>
      {files.length === 0 ? <p className={s.empty}>{empty}</p> : (
        <ul className={s.files}>
          {files.map((f, k) => (
            <li key={f.name + k} className={s.file} title={f.name}>
              <span className={s.ext}>{f.ext}</span>
              <span className={s.fileName}>{f.name}</span>
              <span className={s.fileMeta}>{f.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
