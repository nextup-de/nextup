"use client";
// The idea studio's side of the conversation (docs/IDEAS.md): the drafts list, the open draft,
// one message at a time streamed from /api/<company>/ideas/turn, and the actions on a draft.
// Server mode keeps drafts in Postgres through server/actions/ideas.ts; the local demo keeps them
// in this browser (lib/idea-drafts.ts), per person like the database (`owner`). Either way the
// benchmark comes from the server route -
// except on the static demo (app/demo), which passes `local`: there nothing leaves the browser, the
// benchmark runs here and the coach is the demo script (features/ideas/demo-script) or the offline one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BenchmarkContext, BenchmarkId, BenchmarkPart } from "@/features/ideas/benchmarks";
import { DEFAULT_PUBLISH_THRESHOLD, deltas } from "@/features/ideas/benchmarks";
import type { KnownCase } from "@/features/evaluate";
import type { Reply } from "@/features/ideas/replies";
import type { DraftSummary, DraftView } from "@/features/ideas/drafts";
import { coachMock, ideaFromTurns } from "@/features/ideas/coach";
import { SCRIPT_THINK_MS, scriptReply } from "@/features/ideas/demo-script";
import { scoreDraft } from "@/features/ideas/drafts";
import { withoutSkipped } from "@/features/ideas/raise";
import { latestReading, type Reading } from "@/features/ideas/reading";
import type { Coach, Phase, Progress, Timings } from "@/features/ideas/progress";
import { DEFAULT_TIMINGS, finished, learn, startProgress } from "@/features/ideas/progress";
import type { BrainProposal } from "@/features/routing/brain";
import { draftScope, localDrafts } from "@/lib/idea-drafts";
import { brainProposalAction } from "@/server/actions/brain";
import {
  createIdeaDraftAction, discardIdeaDraftAction, getIdeaDraftAction, ideaRepliesAction, listIdeaDraftsAction, publishIdeaDraftAction, saveIdeaDraftAction,
} from "@/server/actions/ideas";

export type Delta = Record<BenchmarkId, number> & { overall: number };
export type Live = { parts: BenchmarkPart[]; overall: number; delta: Delta | null; sameAs: KnownCase | null; replies: Reply[]; reading: Reading | null };
export type Sending = { text: string; reply: string; step?: "reading" | "coaching" } | null;
export type Meta = { title?: string; affected?: string[]; attachments?: number };
export type Sent = "ok" | "failed" | "dropped"; // what became of a message; failed: it was not stored
export type Recovered = { text: string; first: boolean }; // first: it was the idea itself, so its draft is gone too

// The evaluation while a message is on its way: what has happened so far, and the phase times this browser expects.
export type EvalRun = { progress: Progress; timings: Timings };

// How long each phase took here before, so the orb's bars and "seconds left" follow this company's real waits.
const TIMINGS_KEY = "nextup:eval-timings";
const readTimings = (): Timings => {
  try { const v = localStorage.getItem(TIMINGS_KEY); return v ? { ...DEFAULT_TIMINGS, ...(JSON.parse(v) as Timings) } : { ...DEFAULT_TIMINGS }; } catch { return { ...DEFAULT_TIMINGS }; }
};
const writeTimings = (t: Timings) => { try { localStorage.setItem(TIMINGS_KEY, JSON.stringify(t)); } catch { /* private window: the defaults next time */ } };

type ScoresEvent = { overall: number; parts: BenchmarkPart[]; sameAs: KnownCase | null; threshold: number; delta: Delta | null; replies?: Reply[]; reading?: Reading | null };

// A message on its way, which can take half a minute with a model. It outlives the page that sent it: leave and
// come back and the page finds it here, shows it as still on its way and reloads the draft when it lands.
type Flight = { id: string; text: string; landed: Promise<void> };
const flights = new Map<string, Flight>(); // by draft
const watching = new Map<string, string>(); // this person -> the draft their page had open
// A reload cuts the answer off and the turn is only stored with it, so the message waits here (this tab only)
// until it landed, for the next load to put it back in the box.
const PENDING = (mine: string) => "nextup.ideas.pending." + mine;
let unloading = false, watchingUnload = false; // the reload itself fails the open request: that message is still to be put back
const pending = {
  keep(mine: string, p: { id: string; text: string }) {
    if (!watchingUnload) { watchingUnload = true; window.addEventListener("beforeunload", () => { unloading = true; }); }
    try { window.sessionStorage.setItem(PENDING(mine), JSON.stringify(p)); } catch { /* blocked: only this safety net goes */ }
  },
  clear(mine: string) { if (unloading) return; try { window.sessionStorage.removeItem(PENDING(mine)); } catch { /* as above */ } },
  take(mine: string): { id: string; text: string } | null {
    try {
      const raw = window.sessionStorage.getItem(PENDING(mine));
      window.sessionStorage.removeItem(PENDING(mine));
      return raw ? (JSON.parse(raw) as { id: string; text: string }) : null;
    } catch { return null; }
  },
};

export function useIdeaStudio(slug: string, serverMode: boolean, owner: string, local: BenchmarkContext | null = null) {
  const mine = draftScope(slug, owner); // this browser's drafts are their author's alone, as in the database
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_PUBLISH_THRESHOLD);
  const [draft, setDraft] = useState<DraftView | null>(null); // null = a new idea, not stored yet
  const [live, setLive] = useState<Live | null>(null);
  const [sending, setSending] = useState<Sending>(null);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);
  const learned = useRef<Timings | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [recovered, setRecovered] = useState<Recovered | null>(null);
  const abort = useRef<AbortController | null>(null); // the static demo's pause; a real message is never cut off (see Flight)
  const opened = useRef<string | null>(null); // the draft last opened, so a slow answer for another one is dropped

  // The drafts list, from the server or this browser. Always async, so an effect can call it.
  const fetchList = useCallback(async (): Promise<{ drafts: DraftSummary[]; threshold: number | null } | null> => {
    if (!serverMode) return { drafts: localDrafts.list(mine), threshold: null };
    const r = await listIdeaDraftsAction({ slug });
    return r.ok ? { drafts: r.drafts, threshold: r.threshold } : null;
  }, [slug, serverMode, mine]);
  const apply = (r: { drafts: DraftSummary[]; threshold: number | null } | null) => {
    if (r) { setDrafts(r.drafts); if (r.threshold !== null) setThreshold(r.threshold); }
    setLoaded(true);
  };
  const refresh = useCallback(async () => apply(await fetchList()), [fetchList]);

  useEffect(() => {
    let on = true;
    void fetchList().then((r) => { if (on) apply(r); });
    return () => { on = false; };
  }, [fetchList]);

  const load = useCallback(async (id: string) => (serverMode ? (await getIdeaDraftAction({ slug, id })).draft : localDrafts.get(mine, id)), [slug, serverMode, mine]);
  const fromView = (d: DraftView | null): Live | null => (d && d.scores.length ? { parts: d.scores, overall: d.overall, delta: null, sameAs: null, replies: [], reading: latestReading(d.turns) } : null);

  // The page shows a message still on its way, sent before it last left, until that lands.
  const follow = useCallback((f: Flight) => {
    setSending({ text: f.text, reply: "" });
    void f.landed.then(async () => {
      const d = await load(f.id);
      if (opened.current !== f.id) return;
      setDraft(d); setLive(fromView(d)); setSending(null);
      void refresh();
    });
  }, [load, refresh]);

  // Back on the page: the message it had open and still on its way. A reload instead lost its message: put it back.
  useEffect(() => {
    const id = watching.get(mine), f = id ? flights.get(id) : undefined;
    if (f) {
      opened.current = f.id;
      void load(f.id).then((d) => { if (opened.current === f.id) { setDraft(d); follow(f); } });
      return;
    }
    const p = pending.take(mine);
    if (!p) return;
    void load(p.id).then(async (d) => {
      if (d?.turns.some((x) => x.role === "user" && x.text === p.text)) return; // it landed before the reload
      const first = !d || !d.turns.length;
      if (first && d) { if (serverMode) await discardIdeaDraftAction({ slug, id: p.id }); else localDrafts.discard(mine, p.id); void refresh(); }
      setRecovered({ text: p.text, first });
    });
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps -- once per person, when the page arrives

  // Resolves to the draft, or null when it could not be opened.
  const open = useCallback(async (id: string): Promise<DraftView | null> => {
    abort.current?.abort();
    setError(""); setSending(null);
    opened.current = id;
    watching.set(mine, id);
    const d = await load(id);
    if (opened.current !== id) return d;
    setDraft(d); setLive(fromView(d));
    const f = flights.get(id);
    if (f) follow(f);
    if (!d) { setError("That draft could not be opened."); return null; }
    // The suggested answers are worked out on the server, where the company's goals and routes are.
    if (d.status !== "draft" || local) return d;
    const r = await ideaRepliesAction({ slug, id: d.id, turns: d.turns.map(({ role, text }) => ({ role, text })), affected: d.affected, attachments: d.attachments });
    if (r.ok && opened.current === id) setLive((l) => (l ? { ...l, replies: r.replies } : l));
    return d;
  }, [slug, local, mine, load, follow]);

  const startNew = useCallback(() => {
    abort.current?.abort();
    opened.current = null;
    watching.delete(mine);
    setDraft(null); setLive(null); setSending(null); setError(""); setEvalRun(null);
  }, [mine]);

  // One message: make sure a draft exists, stream the score and the coach, then reload the draft.
  const send = useCallback(async (text: string, meta: { affected: string[]; attachments: number; skip?: string[] }): Promise<Sent> => {
    const t = text.trim();
    if (t.length < 3 || sending) return "dropped";
    setError("");
    // The evaluation, phase by phase as the work really happens: each phase begins when the one before has
    // answered, and the time it took teaches the next wait (features/ideas/progress).
    const clock = () => performance.now();
    const times = (learned.current ??= readTimings());
    let run = startProgress(clock()), coachDone = false;
    let runFor: string | null = null; // the draft this evaluation belongs to, once it has one
    const show = () => { if (runFor === null || opened.current === runFor) setEvalRun({ progress: run, timings: learned.current ?? times }); };
    const begin = (phase: Phase, patch: Partial<Progress> = {}) => {
      const now = clock(), done = finished(run, phase, now);
      if (done) learned.current = learn(learned.current ?? times, done.phase, run.coach, done.ms);
      run = { ...run, ...patch, at: run.at[phase] === undefined ? { ...run.at, [phase]: now } : run.at };
      show();
    };
    const answered = () => {
      if (coachDone || run.at.coach === undefined) return;
      coachDone = true;
      learned.current = learn(learned.current ?? times, "coach", run.coach, clock() - run.at.coach);
      writeTimings(learned.current);
    };
    show();
    let id = draft?.id ?? null;
    if (!id) {
      id = serverMode ? (await createIdeaDraftAction({ slug })).id : localDrafts.create(mine);
      if (!id) { setEvalRun(null); setError("Could not start a draft. Sign in again and retry."); return "failed"; }
      if (serverMode && (meta.affected.length || meta.attachments)) await saveIdeaDraftAction({ slug, id, affected: meta.affected, attachments: meta.attachments });
      else if (!serverMode) localDrafts.saveMeta(mine, id, meta);
    }
    const history = (draft?.turns ?? []).map(({ role, text: x }) => ({ role, text: x }));
    begin("score");
    setSending({ text: t, reply: "" });
    const draftId = id;
    runFor = draftId;
    opened.current = draftId;
    watching.set(mine, draftId);
    const here = () => opened.current === draftId; // still the draft on screen: what comes in may show
    let land = () => {};
    flights.set(draftId, { id: draftId, text: t, landed: new Promise<void>((done) => { land = done; }) });
    if (!local) pending.keep(mine, { id: draftId, text: t });
    const off = () => { flights.delete(draftId); pending.clear(mine); land(); };
    const ctl = (abort.current = new AbortController());
    let scores: ScoresEvent | null = null, reply = "";
    if (local) {
      // The static demo: scored here, answered after a short pause, so it reads like a reply being written.
      const prev = history.some((x) => x.role === "user") ? scoreDraft({ turns: history, affected: meta.affected, attachments: meta.attachments }, local) : null;
      const now = scoreDraft({ turns: [...history, { role: "user", text: t }], affected: meta.affected, attachments: meta.attachments }, local);
      scores = { overall: now.overall, parts: now.parts, sameAs: now.sameAs, threshold: DEFAULT_PUBLISH_THRESHOLD, delta: prev ? deltas(prev, now) : null };
      setLive({ parts: now.parts, overall: now.overall, delta: scores.delta, sameAs: now.sameAs, replies: [], reading: null });
      begin("coach", { coach: "offline", overall: now.overall, threshold: DEFAULT_PUBLISH_THRESHOLD, similar: now.sameAs?.title ?? null });
      await new Promise((done) => setTimeout(done, SCRIPT_THINK_MS));
      if (ctl.signal.aborted) { off(); return "dropped"; }
      answered();
      reply = scriptReply(history, t) ?? coachMock(prev, withoutSkipped(now, meta.skip ?? []), DEFAULT_PUBLISH_THRESHOLD, t, 0);
    } else try {
      const res = await fetch(`/api/${encodeURIComponent(slug)}/ideas/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, draftId: serverMode ? id : undefined, history, affected: meta.affected, attachments: meta.attachments, skip: meta.skip ?? [] }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "The coach could not answer just now.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut: number;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const event = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (event === "status") {
            // Which step the brain is on, for the words beside the dots.
            const step = data.step === "coaching" ? "coaching" : "reading";
            if (here()) setSending((s) => (s ? { ...s, step } : s));
          } else if (event === "scores") {
            scores = data as unknown as ScoresEvent;
            setThreshold(scores.threshold);
            if (here()) setLive({ parts: scores.parts, overall: scores.overall, delta: scores.delta, sameAs: scores.sameAs, replies: scores.replies ?? [], reading: scores.reading ?? null });
            begin("coach", { overall: scores.overall, threshold: scores.threshold, similar: scores.sameAs?.title ?? null });
          } else if (event === "stage") {
            // Which coach is answering - the brain, the model, or the offline one - so the wait is said and timed as its own.
            const by = data.by;
            if (by === "brain" || by === "model" || by === "offline") { run = { ...run, coach: by as Coach }; show(); }
          } else if (event === "replies") {
            // The brain's own suggested answer arrives with its reply, after the scores.
            const replies = (data.replies ?? []) as Reply[];
            if (here()) setLive((l) => (l ? { ...l, replies } : l));
          } else if (event === "text") {
            answered();
            reply = String(data.text ?? "");
            if (here()) setSending((s) => (s ? { ...s, reply } : s));
          } else if (event === "error") throw new Error(String(data.message ?? ""));
        }
      }
    } catch (e) {
      off();
      if (!here()) return "failed";
      setEvalRun(null);
      setSending(null);
      setError((e as Error).message || "The coach could not answer just now.");
      // A first message's draft stays open, so sending it again does not start another.
      if (!draft) setDraft(await load(draftId));
      return "failed";
    }
    // The local demo stores the turn itself; the server already did in server mode.
    if (!serverMode && scores) {
      const turns = [...history, { role: "user" as const, text: t }];
      localDrafts.addTurns(mine, id, [{ role: "user", text: t }, { role: "assistant", text: reply, overall: scores.overall, reading: scores.reading ?? null }],
        { title: ideaFromTurns(turns).title, overall: scores.overall, scores: scores.parts });
    }
    const d = await load(draftId);
    off();
    if (here()) { setDraft(d); setSending(null); setEvalRun(null); }
    void refresh();
    return "ok";
  }, [draft, sending, slug, serverMode, local, mine, refresh, load]);

  // The static demo only: prepared turns added to the open draft in one go, each reply scored as if the
  // conversation had been had one message at a time (the demo controls' "Full conversation").
  const addScripted = useCallback((steps: readonly { say: string; reply: string }[]) => {
    if (!local || serverMode || !draft || sending || !steps.length) return;
    const meta = { affected: draft.affected, attachments: draft.attachments };
    const history = draft.turns.map(({ role, text }) => ({ role, text }));
    const added: { role: "user" | "assistant"; text: string; overall?: number }[] = [];
    let b = scoreDraft({ turns: history, ...meta }, local);
    for (const s of steps) {
      history.push({ role: "user", text: s.say });
      b = scoreDraft({ turns: history, ...meta }, local);
      history.push({ role: "assistant", text: s.reply });
      added.push({ role: "user", text: s.say }, { role: "assistant", text: s.reply, overall: b.overall });
    }
    localDrafts.addTurns(mine, draft.id, added, { title: draft.title || ideaFromTurns(history).title, overall: b.overall, scores: b.parts });
    const d = localDrafts.get(mine, draft.id);
    setDraft(d); setLive(fromView(d));
    void refresh();
  }, [local, serverMode, draft, sending, mine, refresh]);

  const save = useCallback(async (meta: Meta) => {
    if (!draft) return true;
    const ok = serverMode ? (await saveIdeaDraftAction({ slug, id: draft.id, ...meta })).ok : localDrafts.saveMeta(mine, draft.id, meta);
    if (ok) {
      setDraft((d) => (d ? { ...d, ...meta, updatedAt: new Date().toISOString() } : d));
      void refresh();
    }
    return ok;
  }, [draft, slug, serverMode, mine, refresh]);

  const discard = useCallback(async () => {
    if (!draft) { startNew(); return; }
    const ok = serverMode ? (await discardIdeaDraftAction({ slug, id: draft.id })).ok : localDrafts.discard(mine, draft.id);
    if (ok) { startNew(); void refresh(); }
  }, [draft, slug, serverMode, mine, refresh, startNew]);

  // Asks for the publish; the page appends case.raised with `caseId` only when this says yes. In server mode that
  // case.raised publishes the draft (Q1.11); the local demo marks it here, as its raise cannot be refused.
  // Then asks the brain for the routing row (null where the stack has none or it did not answer).
  const publish = useCallback(async (caseId: string): Promise<{ ok: true; title: string; body: string; brain: BrainProposal | null } | { ok: false; reason: string }> => {
    if (!draft) return { ok: false, reason: "Write the idea first." };
    const withBrain = async (title: string, body: string) =>
      ({ ok: true as const, title, body, brain: local ? null : await brainProposalAction({ slug, title, body }).catch(() => null) });
    if (serverMode) {
      const r = await publishIdeaDraftAction({ slug, id: draft.id, caseId });
      if (!r.ok) return { ok: false, reason: r.overall !== undefined ? `It scores ${r.overall}; it needs ${r.threshold}.` : r.reason };
      void refresh();
      return withBrain(r.title, r.body);
    }
    const idea = ideaFromTurns(draft.turns);
    const title = draft.title || idea.title;
    localDrafts.publish(mine, draft.id, caseId, { title, overall: draft.overall, scores: draft.scores });
    void refresh();
    return withBrain(title, idea.body);
  }, [draft, slug, serverMode, local, mine, refresh]);

  const overall = live?.overall ?? draft?.overall ?? 0;
  return { drafts, threshold, draft, live, sending, evalRun, error, loaded, overall, recovered, setRecovered, open, startNew, send, addScripted, save, discard, publish, setError };
}
