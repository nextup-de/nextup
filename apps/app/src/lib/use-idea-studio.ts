"use client";
// The idea studio's side of the conversation (docs/IDEAS.md): the drafts list, the open draft,
// one message at a time streamed from /api/<company>/ideas/turn, and the actions on a draft.
// Server mode keeps drafts in Postgres through server/actions/ideas.ts; the local demo keeps them
// in this browser (lib/idea-drafts.ts). Either way the benchmark comes from the server route.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BenchmarkId, BenchmarkPart } from "@/features/ideas/benchmarks";
import { canPublish, DEFAULT_PUBLISH_THRESHOLD } from "@/features/ideas/benchmarks";
import type { KnownCase } from "@/features/evaluate";
import type { DraftSummary, DraftView } from "@/features/ideas/drafts";
import { ideaFromTurns } from "@/features/ideas/coach";
import { localDrafts } from "@/lib/idea-drafts";
import {
  createIdeaDraftAction, discardIdeaDraftAction, getIdeaDraftAction, listIdeaDraftsAction, publishIdeaDraftAction, saveIdeaDraftAction,
} from "@/server/actions/ideas";

export type Delta = Record<BenchmarkId, number> & { overall: number };
export type Live = { parts: BenchmarkPart[]; overall: number; delta: Delta | null; sameAs: KnownCase | null };
export type Sending = { text: string; reply: string } | null;
export type Meta = { title?: string; affected?: string[]; attachments?: number };

type ScoresEvent = { overall: number; parts: BenchmarkPart[]; sameAs: KnownCase | null; threshold: number; delta: Delta | null };

export function useIdeaStudio(slug: string, serverMode: boolean) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_PUBLISH_THRESHOLD);
  const [draft, setDraft] = useState<DraftView | null>(null); // null = a new idea, not stored yet
  const [live, setLive] = useState<Live | null>(null);
  const [sending, setSending] = useState<Sending>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // The drafts list, from the server or this browser. Always async, so an effect can call it.
  const fetchList = useCallback(async (): Promise<{ drafts: DraftSummary[]; threshold: number | null } | null> => {
    if (!serverMode) return { drafts: localDrafts.list(slug), threshold: null };
    const r = await listIdeaDraftsAction({ slug });
    return r.ok ? { drafts: r.drafts, threshold: r.threshold } : null;
  }, [slug, serverMode]);
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

  const fromView = (d: DraftView | null): Live | null => (d && d.scores.length ? { parts: d.scores, overall: d.overall, delta: null, sameAs: null } : null);

  const open = useCallback(async (id: string) => {
    abort.current?.abort();
    setError(""); setSending(null);
    const d = serverMode ? (await getIdeaDraftAction({ slug, id })).draft : localDrafts.get(slug, id);
    setDraft(d); setLive(fromView(d));
    if (!d) setError("That draft could not be opened.");
  }, [slug, serverMode]);

  const startNew = useCallback(() => {
    abort.current?.abort();
    setDraft(null); setLive(null); setSending(null); setError("");
  }, []);

  // One message: make sure a draft exists, stream the score and the coach, then reload the draft.
  const send = useCallback(async (text: string, meta: { affected: string[]; attachments: number }) => {
    const t = text.trim();
    if (t.length < 3 || sending) return;
    setError("");
    let id = draft?.id ?? null;
    if (!id) {
      id = serverMode ? (await createIdeaDraftAction({ slug })).id : localDrafts.create(slug);
      if (!id) { setError("Could not start a draft. Sign in again and retry."); return; }
      if (serverMode && (meta.affected.length || meta.attachments)) await saveIdeaDraftAction({ slug, id, affected: meta.affected, attachments: meta.attachments });
      else if (!serverMode) localDrafts.saveMeta(slug, id, meta);
    }
    const history = (draft?.turns ?? []).map(({ role, text: x }) => ({ role, text: x }));
    setSending({ text: t, reply: "" });
    const ctl = (abort.current = new AbortController());
    let scores: ScoresEvent | null = null, reply = "";
    try {
      const res = await fetch(`/api/${encodeURIComponent(slug)}/ideas/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, draftId: serverMode ? id : undefined, history, affected: meta.affected, attachments: meta.attachments }),
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
            setLive({ parts: scores.parts, overall: scores.overall, delta: scores.delta, sameAs: scores.sameAs });
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
      localDrafts.addTurns(slug, id, [{ role: "user", text: t }, { role: "assistant", text: reply, overall: scores.overall }],
        { title: ideaFromTurns(turns).title, overall: scores.overall, scores: scores.parts });
    }
    const d = serverMode ? (await getIdeaDraftAction({ slug, id })).draft : localDrafts.get(slug, id);
    setDraft(d); setSending(null);
    void refresh();
  }, [draft, sending, slug, serverMode, refresh]);

  const save = useCallback(async (meta: Meta) => {
    if (!draft) return true;
    const ok = serverMode ? (await saveIdeaDraftAction({ slug, id: draft.id, ...meta })).ok : localDrafts.saveMeta(slug, draft.id, meta);
    if (ok) {
      setDraft((d) => (d ? { ...d, ...meta, updatedAt: new Date().toISOString() } : d));
      void refresh();
    }
    return ok;
  }, [draft, slug, serverMode, refresh]);

  const discard = useCallback(async () => {
    if (!draft) { startNew(); return; }
    const ok = serverMode ? (await discardIdeaDraftAction({ slug, id: draft.id })).ok : localDrafts.discard(slug, draft.id);
    if (ok) { startNew(); void refresh(); }
  }, [draft, slug, serverMode, refresh, startNew]);

  // Asks for the publish; the page appends case.raised with `caseId` only when this says yes.
  const publish = useCallback(async (caseId: string): Promise<{ ok: true; title: string; body: string } | { ok: false; reason: string }> => {
    if (!draft) return { ok: false, reason: "Write the idea first." };
    if (serverMode) {
      const r = await publishIdeaDraftAction({ slug, id: draft.id, caseId });
      if (!r.ok) return { ok: false, reason: r.overall !== undefined ? `It scores ${r.overall}; it needs ${r.threshold}.` : r.reason };
      void refresh();
      return { ok: true, title: r.title, body: r.body };
    }
    if (!canPublish(draft.overall, threshold)) return { ok: false, reason: `It scores ${draft.overall}; it needs ${threshold}.` };
    const idea = ideaFromTurns(draft.turns);
    const title = draft.title || idea.title;
    localDrafts.publish(slug, draft.id, caseId, { title, overall: draft.overall, scores: draft.scores });
    void refresh();
    return { ok: true, title, body: idea.body };
  }, [draft, slug, serverMode, threshold, refresh]);

  const overall = live?.overall ?? draft?.overall ?? 0;
  return { drafts, threshold, draft, live, sending, error, loaded, overall, open, startNew, send, save, discard, publish, setError };
}
