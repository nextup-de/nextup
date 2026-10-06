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
import type { BrainProposal } from "@/features/routing/brain";
import { draftScope, localDrafts } from "@/lib/idea-drafts";
import { brainProposalAction } from "@/server/actions/brain";
import {
  createIdeaDraftAction, discardIdeaDraftAction, getIdeaDraftAction, ideaRepliesAction, listIdeaDraftsAction, publishIdeaDraftAction, saveIdeaDraftAction,
} from "@/server/actions/ideas";

export type Delta = Record<BenchmarkId, number> & { overall: number };
export type Live = { parts: BenchmarkPart[]; overall: number; delta: Delta | null; sameAs: KnownCase | null; replies: Reply[] };
export type Sending = { text: string; reply: string } | null;
export type Meta = { title?: string; affected?: string[]; attachments?: number };

type ScoresEvent = { overall: number; parts: BenchmarkPart[]; sameAs: KnownCase | null; threshold: number; delta: Delta | null; replies?: Reply[] };

export function useIdeaStudio(slug: string, serverMode: boolean, owner: string, local: BenchmarkContext | null = null) {
  const mine = draftScope(slug, owner); // this browser's drafts are their author's alone, as in the database
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_PUBLISH_THRESHOLD);
  const [draft, setDraft] = useState<DraftView | null>(null); // null = a new idea, not stored yet
  const [live, setLive] = useState<Live | null>(null);
  const [sending, setSending] = useState<Sending>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const abort = useRef<AbortController | null>(null);
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

  const fromView = (d: DraftView | null): Live | null => (d && d.scores.length ? { parts: d.scores, overall: d.overall, delta: null, sameAs: null, replies: [] } : null);

  const open = useCallback(async (id: string) => {
    abort.current?.abort();
    setError(""); setSending(null);
    opened.current = id;
    const d = serverMode ? (await getIdeaDraftAction({ slug, id })).draft : localDrafts.get(mine, id);
    if (opened.current !== id) return;
    setDraft(d); setLive(fromView(d));
    if (!d) { setError("That draft could not be opened."); return; }
    // The suggested answers are worked out on the server, where the company's goals and routes are.
    if (d.status !== "draft" || local) return;
    const r = await ideaRepliesAction({ slug, id: d.id, turns: d.turns.map(({ role, text }) => ({ role, text })), affected: d.affected, attachments: d.attachments });
    if (r.ok && opened.current === id) setLive((l) => (l ? { ...l, replies: r.replies } : l));
  }, [slug, serverMode, local, mine]);

  const startNew = useCallback(() => {
    abort.current?.abort();
    opened.current = null;
    setDraft(null); setLive(null); setSending(null); setError("");
  }, []);

  // One message: make sure a draft exists, stream the score and the coach, then reload the draft.
  const send = useCallback(async (text: string, meta: { affected: string[]; attachments: number; skip?: string[] }) => {
    const t = text.trim();
    if (t.length < 3 || sending) return;
    setError("");
    let id = draft?.id ?? null;
    if (!id) {
      id = serverMode ? (await createIdeaDraftAction({ slug })).id : localDrafts.create(mine);
      if (!id) { setError("Could not start a draft. Sign in again and retry."); return; }
      if (serverMode && (meta.affected.length || meta.attachments)) await saveIdeaDraftAction({ slug, id, affected: meta.affected, attachments: meta.attachments });
      else if (!serverMode) localDrafts.saveMeta(mine, id, meta);
    }
    const history = (draft?.turns ?? []).map(({ role, text: x }) => ({ role, text: x }));
    setSending({ text: t, reply: "" });
    const ctl = (abort.current = new AbortController());
    let scores: ScoresEvent | null = null, reply = "";
    if (local) {
      // The static demo: scored here, answered after a short pause, so it reads like a reply being written.
      const prev = history.some((x) => x.role === "user") ? scoreDraft({ turns: history, affected: meta.affected, attachments: meta.attachments }, local) : null;
      const now = scoreDraft({ turns: [...history, { role: "user", text: t }], affected: meta.affected, attachments: meta.attachments }, local);
      scores = { overall: now.overall, parts: now.parts, sameAs: now.sameAs, threshold: DEFAULT_PUBLISH_THRESHOLD, delta: prev ? deltas(prev, now) : null };
      setLive({ parts: now.parts, overall: now.overall, delta: scores.delta, sameAs: now.sameAs, replies: [] });
      await new Promise((done) => setTimeout(done, SCRIPT_THINK_MS));
      if (ctl.signal.aborted) return;
      reply = scriptReply(history, t) ?? coachMock(prev, withoutSkipped(now, meta.skip ?? []), DEFAULT_PUBLISH_THRESHOLD, t, 0);
    } else try {
      const res = await fetch(`/api/${encodeURIComponent(slug)}/ideas/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, draftId: serverMode ? id : undefined, history, affected: meta.affected, attachments: meta.attachments, skip: meta.skip ?? [] }),
        signal: ctl.signal,
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
          if (event === "scores") {
            scores = data as unknown as ScoresEvent;
            setThreshold(scores.threshold);
            setLive({ parts: scores.parts, overall: scores.overall, delta: scores.delta, sameAs: scores.sameAs, replies: scores.replies ?? [] });
          } else if (event === "replies") {
            // The brain's own suggested answer arrives with its reply, after the scores.
            const replies = (data.replies ?? []) as Reply[];
            setLive((l) => (l ? { ...l, replies } : l));
          } else if (event === "text") {
            reply = String(data.text ?? "");
            setSending((s) => (s ? { ...s, reply } : s));
          } else if (event === "error") throw new Error(String(data.message ?? ""));
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSending(null);
      setError((e as Error).message || "The coach could not answer just now.");
      return;
    }
    // The local demo stores the turn itself; the server already did in server mode.
    if (!serverMode && scores) {
      const turns = [...history, { role: "user" as const, text: t }];
      localDrafts.addTurns(mine, id, [{ role: "user", text: t }, { role: "assistant", text: reply, overall: scores.overall }],
        { title: ideaFromTurns(turns).title, overall: scores.overall, scores: scores.parts });
    }
    const d = serverMode ? (await getIdeaDraftAction({ slug, id })).draft : localDrafts.get(mine, id);
    setDraft(d); setSending(null);
    void refresh();
  }, [draft, sending, slug, serverMode, local, mine, refresh]);

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

  // Asks for the publish; the page appends case.raised with `caseId` only when this says yes.
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
  return { drafts, threshold, draft, live, sending, error, loaded, overall, open, startNew, send, save, discard, publish, setError };
}
