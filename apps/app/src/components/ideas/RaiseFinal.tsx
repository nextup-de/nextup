"use client";
// The finalized idea as a document (features/ideas/finalize.ts): what the author reads through before it
// goes out. "Finalize" locks this version in; then it can be sent to the receiver, saved as a PDF (the
// browser's print dialog, with its own print layout - no library) or copied as text. Props in.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { docFileName, docText, type IdeaDoc } from "@/features/ideas/finalize";
import { Icon } from "./raiseIcons";
import s from "./RaiseFinal.module.css";

function Doc({ d, final }: { d: IdeaDoc; final: boolean }) {
  return (
    <article className={s.doc} data-final={final} aria-label="Idea document">
      <header className={s.head}>
        <span className={s.kicker}>Idea · {final ? "Final" : "Draft"}</span>
        <h1 className={s.title}>{d.title}</h1>
        <p className={s.meta}>{d.author} · {d.team} · {d.date}</p>
        <p className={s.meta}>Goes to <b>{d.receiver}</b></p>
      </header>

      <section className={s.sec}>
        <h2 className={s.h}>Summary</h2>
        <p className={s.lead}>{d.summary}</p>
        <p className={s.advice}><span className={s.adviceTag} data-advice={d.advice.name}>{d.advice.name}</span>{d.advice.why}</p>
      </section>

      <section className={s.sec}>
        <h2 className={s.h}>The idea</h2>
        <p className={s.p}>{d.description}</p>
        {d.details.length > 0 && <ul className={s.list}>{d.details.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </section>

      <section className={s.sec}>
        <h2 className={s.h}>Assessment</h2>
        <table className={s.table}>
          <thead><tr><th>Measure</th><th>Level</th><th>Score</th><th>What it rests on</th></tr></thead>
          <tbody>
            {d.dials.map((x) => <tr key={x.label}><th scope="row">{x.label}</th><td>{x.level}</td><td>{x.score}</td><td>{x.note}</td></tr>)}
          </tbody>
        </table>
        <p className={s.small}>{d.pattern}</p>
      </section>

      {d.dials.some((x) => x.facts.length > 0) && (
        <section className={s.sec}>
          <h2 className={s.h}>Checked across the company</h2>
          <ul className={s.list}>
            {d.dials.flatMap((x) => x.facts.map((f) => <li key={x.label + f.text}><span className={s.src}>{f.source}</span> {f.text}</li>))}
          </ul>
        </section>
      )}

      {d.open.length > 0 && (
        <section className={s.sec}>
          <h2 className={s.h}>Still open</h2>
          <ul className={s.list}>{d.open.map((o) => <li key={o}>{o}</li>)}</ul>
        </section>
      )}

      <section className={s.sec}>
        <h2 className={s.h}>Similar ideas</h2>
        <ul className={s.list}>
          {d.similar.length ? d.similar.map((m) => <li key={m.title}>{m.title} <span className={s.src}>{m.status}{m.by ? " · " + m.by : ""}</span></li>) : <li>None found</li>}
        </ul>
      </section>

      {d.conversation.length > 0 && (
        <section className={s.sec}>
          <h2 className={s.h}>How we got here</h2>
          <ol className={s.talk}>
            {d.conversation.map((l, i) => <li key={i} data-who={l.who}><b>{l.who === "coach" ? "NextUp" : d.author}</b> {l.text}</li>)}
          </ol>
        </section>
      )}

      <section className={s.sec}>
        <h2 className={s.h}>Sources</h2>
        <ol className={s.sources}>{d.sources.map((x) => <li key={x.name}><b>{x.name}</b> · {x.where}</li>)}</ol>
      </section>

      <footer className={s.foot}>AI suggestions only. You make the decision.</footer>
    </article>
  );
}

export function RaiseFinal({ doc, final, published, canSend, onSend, onEdit, onBack, onClose, onCopied }: {
  doc: IdeaDoc;
  final: boolean; // sent from here: this version is the one that went out
  published: boolean;
  canSend: boolean;
  onSend: () => void; // finalizes this version and goes on to the receiver
  onEdit: () => void; // back to the last look, where title, description and details are edited
  onBack: () => void; // back to the conversation
  onClose: () => void;
  onCopied: (ok: boolean) => void;
}) {
  const [printing, setPrinting] = useState(false);
  // The PDF is the browser's print dialog on a copy of the document rendered straight under <body>, so no
  // page chrome comes along; the file is named after the idea.
  useEffect(() => {
    if (!printing) return;
    const before = document.title;
    document.title = docFileName(doc);
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.title = before; };
  }, [printing, doc]);

  const copy = () => { navigator.clipboard.writeText(docText(doc)).then(() => onCopied(true), () => onCopied(false)); };

  return (
    <div className={s.sheet}>
      <div className={s.col}>
        <div className={s.bar}>
          <div className={s.barText}>
            <span className={s.barKicker}>{published ? "Published" : "Final document"}</span>
            <span className={s.barSub}>{published ? "The document that went out." : "Read it through. Sending it finalizes this version."}</span>
          </div>
          <button type="button" className={s.close} onClick={onClose} title="Close document" aria-label="Close document"><Icon name="x" size={13.5} stroke="#fff" width={2.4} /></button>
        </div>
        <div className={s.actions}>
          {!published && <button type="button" className={s.btn} data-primary="blue" onClick={onSend} disabled={!canSend}><Icon name="up" size={12} width={2.4} />Send idea</button>}
          <button type="button" className={s.btn} onClick={() => setPrinting(true)}><Icon name="download" size={11} width={2.4} />Save as PDF</button>
          <button type="button" className={s.btn} onClick={copy}><Icon name="file" size={11} width={2.2} />Copy text</button>
          {!published && <button type="button" className={s.btn} onClick={onEdit}><Icon name="pencil" size={11} width={2.2} />Edit details</button>}
          {!published && <button type="button" className={s.btn} onClick={onBack}>Back to the chat</button>}
        </div>
        <Doc d={doc} final={final || published} />
      </div>
      {printing && createPortal(<div data-print-doc="" className={s.printRoot}><Doc d={doc} final={final || published} /></div>, document.body)}
    </div>
  );
}
