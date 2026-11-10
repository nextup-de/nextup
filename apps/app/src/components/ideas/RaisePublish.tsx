"use client";
// What "Publish idea" does on the raise page: the button shows the working glyph while NextUp works out
// where the idea should go, then this window offers up to 3 desks (a role that owns a route, its holders
// second, D13) with the reasons, or any other desk by search. After sending it says which role owes an
// answer by which date. Props in.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { OrbState } from "thinking-orbs/engine";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import type { Desk } from "@/features/ideas/desks";
import { Icon } from "./raiseIcons";
import s from "./Raise.module.css";

// What NextUp is doing right now, said in the button: our thinking orb, in the mode that fits the step,
// and the step itself ("Asking the router…").
export type Work = { label: string; orb: OrbState };
const MOTION = "(prefers-reduced-motion: reduce)";
const prefersReduced = () => window.matchMedia(MOTION).matches;
const onMotionPref = (f: () => void) => { const m = window.matchMedia(MOTION); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };

export function Working({ work }: { work: Work }) {
  const reduced = useSyncExternalStore(onMotionPref, prefersReduced, () => false);
  return (
    <span className={s.working} role="status">
      <span className={s.workingOrb} aria-hidden="true"><EvalOrb state={work.orb} size={18} paused={reduced} /></span>
      <span key={work.label} className={s.workingLabel}>{work.label}</span>
    </span>
  );
}

const PAGE = 5;

export type Sent = { role: string; names: string[]; deputies: string[]; date: string };

export function DeskDialog({ desks, aiOff, search, work, sent, casesHref, onCancel, onConfirm }: {
  desks: Desk[];
  aiOff: boolean; // the proposal came from the keywords
  search: (query: string) => Desk[]; // every other desk, by title and department
  work: Work | null; // publishing: what it is doing
  sent: Sent | null; // after sending
  casesHref: string;
  onCancel: () => void;
  onConfirm: (d: Desk) => void;
}) {
  const t = useT();
  const [chosen, setChosen] = useState<Desk | null>(desks.find((d) => d.recommended) ?? null);
  const [custom, setCustom] = useState<Desk | null>(null); // another desk, once picked
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const busy = work !== null;
  const field = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { if (searching) field.current?.focus(); }, [searching]);
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const taken = new Set(desks.map((d) => d.roleId));
  const found = search(q).filter((d) => !taken.has(d.roleId)).slice(0, PAGE);
  const pick = (d: Desk) => { setCustom(d); setChosen(d); setSearching(false); setQ(""); };
  const select = (d: Desk) => { if (!busy) { setChosen(d); setSearching(false); } };
  const who = (d: Desk) => (!d.vacant ? d.holders.join(", ") : d.deputies.length ? t("ideas.deskVacantDeputy", { names: d.deputies.join(", ") }) : t("ideas.deskVacant"));
  const tag = (d: Desk) => (d.proposedBy === "ai" ? t("ideas.deskProposedAi") : d.proposedBy === "keywords" ? t("ideas.deskProposed") : "");

  const row = (d: Desk) => {
    const on = chosen?.roleId === d.roleId;
    return (
      <div key={d.roleId} className={s.rcv} data-on={on} data-testid={"raise-desk-" + d.roleId}>
        <div role="radio" aria-checked={on} aria-disabled={busy || undefined} tabIndex={busy ? -1 : 0} className={s.rcvTop}
          onClick={() => select(d)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d); } }}>
          <span className={s.rcvRadio} aria-hidden="true" />
          <span className={s.rcvWho}>
            <span className={s.rcvNameRow}><span className={s.rcvName}>{d.title}</span>{tag(d) && <span className={s.rcvTag}>{tag(d)}</span>}</span>
            <span className={s.rcvRole}>{[d.title, d.dept, who(d)].join(" · ")}</span>
          </span>
        </div>
        {on && d.reasons.length > 0 && (
          <div className={s.rcvWhy}>
            <span className={s.rcvWhyLabel}>{t("ideas.deskWhy")}</span>
            <ul className={s.rcvReasons}>{d.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={s.dlgWrap}>
      <button type="button" className={s.dlgScrim} onClick={busy ? undefined : onCancel} aria-label={t("common.close")} tabIndex={-1} />
      <div ref={dialog} className={s.dlg} role="dialog" aria-modal="true" aria-labelledby="rcv-title" tabIndex={-1}>
        <div className={s.dlgHead}>
          <div className={s.dlgHeadText}>
            <span className={s.dlgKicker}>{t("ideas.publishKicker")}</span>
            <h2 id="rcv-title" className={s.dlgTitle}>{t("ideas.publishTitle")}</h2>
          </div>
          <button type="button" className={s.dlgClose} onClick={onCancel} disabled={busy} title={t("common.close")} aria-label={t("common.close")}><Icon name="x" size={11} width={2.6} /></button>
        </div>

        {sent ? (
          <div className={s.rcvs} data-testid="raise-sent" role="status">
            <p className={s.rcvName}>{sent.names.length ? t("ideas.deskSent", { role: sent.role, names: sent.names.join(", "), date: sent.date })
              : sent.deputies.length ? t("ideas.deskSentDeputy", { role: sent.role, names: sent.deputies.join(", "), date: sent.date })
                : t("ideas.deskSentVacant", { role: sent.role, date: sent.date })}</p>
            <Link href={casesHref} className={s.rcvRole}>{t("ideas.deskFollow")}</Link>
          </div>
        ) : (
          <div className={s.rcvs} role="radiogroup" aria-label={t("ideas.publishTitle")}>
            {!desks.length && <span className={s.rcvRole}>{t("ideas.deskNone")}</span>}
            {desks.map(row)}
            {custom && !taken.has(custom.roleId) && row(custom)}
            <div className={s.rcv} data-on={searching && !chosen} data-testid="raise-desk-other">
              <button type="button" className={s.rcvTop} onClick={() => setSearching(!searching)} disabled={busy} aria-expanded={searching}>
                <span className={s.rcvRadio} aria-hidden="true" />
                <span className={s.rcvWho}>
                  <span className={s.rcvName}>{t("ideas.deskOther")}</span>
                  <span className={s.rcvRole}>{t("ideas.deskOtherSub")}</span>
                </span>
                <Icon name="right" size={12} stroke="var(--nh-mute-2)" width={2.4} className={s.rcvChevron} />
              </button>
              {searching && (
                <div className={s.rcvSearch}>
                  <input ref={field} className={s.pickInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ideas.deskOtherSub")} aria-label={t("ideas.deskOtherSub")} />
                  <div className={s.rcvList}>
                    {found.map((d) => (
                      <button key={d.roleId} type="button" className={`${s.mRow} ${s.pickRow}`} onClick={() => pick(d)}>
                        <span className={s.pickText}><span className={s.pickName}>{d.title}</span><span className={s.pickMeta}>{d.dept} · {who(d)}</span></span>
                      </button>
                    ))}
                    {!found.length && <span className={s.noMatch}>{t("ideas.publishNoMatches")}</span>}
                  </div>
                </div>
              )}
            </div>
            {aiOff && <span className={s.rcvRole}>{t("ideas.deskAiOff")}</span>}
          </div>
        )}

        <div className={s.dlgFoot}>
          {sent
            ? <button type="button" className={s.dlgGo} onClick={onCancel}>{t("common.close")}</button>
            : <>
              <button type="button" className={s.dlgCancel} onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
              <button type="button" className={s.dlgGo} data-testid="raise-send" onClick={() => chosen && onConfirm(chosen)} disabled={busy || !chosen}>
                {work ? <Working work={work} /> : <><Icon name="up" size={12} width={2.4} />{chosen ? t("ideas.deskSend", { role: chosen.title }) : t("ideas.deskSendNone")}</>}
              </button>
            </>}
        </div>
      </div>
    </div>
  );
}
