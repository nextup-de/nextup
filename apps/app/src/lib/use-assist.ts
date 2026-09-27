"use client";
// The raise page's side of the assistant: one conversation, streamed from /api/<company>/assist.
// The server has already redacted and checked every piece of text that arrives here.
// If the assistant is off for the company (403 {off}), `available` turns false and the page
// raises directly, as it did before there was an assistant.
import { useCallback, useRef, useState } from "react";
import type { Turn } from "@/features/assist/draft";

export type ShownSource = { tag: string; kind: string; label: string; level: string };
export type AssistStatus = "idle" | "asking" | "answered" | "blocked" | "error";
export type AssistView = {
  status: AssistStatus;
  available: boolean;
  turns: Turn[]; // finished question/answer pairs
  question: string; // the one being answered
  text: string; // the answer so far
  sources: ShownSource[];
  unsourced: boolean;
  note: string; // why it was blocked, or the error
  turnId: string | null;
  sessionId: string;
  retentionDays: number; // 0 = nothing is stored (no session, the local demo)
};

const newSession = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    // UUID v4 bits
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    return uuid.replace(/[^A-Za-z0-9_-]/g, "");
  }
  throw new Error("Secure random source is unavailable");
};
const fresh = (available = true): AssistView => ({ status: "idle", available, turns: [], question: "", text: "", sources: [], unsourced: false, note: "", turnId: null, sessionId: newSession(), retentionDays: 0 });

type Done = { turnId: string | null; blocked: boolean; reason?: string; text: string; sources: ShownSource[]; unsourced: boolean; retentionDays: number };

export function useAssist(slug: string) {
  const [v, setV] = useState<AssistView>(() => fresh());
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string): Promise<"asked" | "off"> => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    const history = v.turns;
    setV((s) => ({ ...s, status: "asking", question, text: "", sources: [], note: "", turnId: null, unsourced: false }));
    try {
      const res = await fetch(`/api/${encodeURIComponent(slug)}/assist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sessionId: v.sessionId, history }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; off?: boolean };
        if (err.off) { setV((s) => ({ ...s, status: "idle", available: false })); return "off"; }
        setV((s) => ({ ...s, status: "error", note: err.error ?? "The assistant could not answer just now. You can still raise it." }));
        return "asked";
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
          const data = JSON.parse(raw) as Partial<Done> & { message?: string };
          if (event === "text") setV((s) => ({ ...s, text: data.text ?? "", sources: data.sources ?? [] }));
          else if (event === "error") setV((s) => ({ ...s, status: "error", note: data.message ?? "" }));
          else if (event === "done") {
            const d = data as Done;
            setV((s) => d.blocked
              ? { ...s, status: "blocked", note: d.reason ?? "", text: "", retentionDays: d.retentionDays }
              : { ...s, status: "answered", text: d.text, sources: d.sources, unsourced: d.unsourced, turnId: d.turnId, retentionDays: d.retentionDays, turns: [...s.turns, { role: "user", text: question }, { role: "assistant", text: d.text }] });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setV((s) => ({ ...s, status: "error", note: "The assistant could not answer just now. You can still raise it." }));
    }
    return "asked";
  }, [slug, v.turns, v.sessionId]);

  const reset = useCallback(() => { abort.current?.abort(); setV((s) => fresh(s.available)); }, []);

  return { view: v, ask, reset };
}
