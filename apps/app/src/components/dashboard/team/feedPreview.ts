"use client";
// Stand-ins for what the Feed shows but the event log cannot record yet - the list for Kevin is the
// Feed handoff note (FEED-FOR-KEVIN.txt). The screen is the real one; this state is not: it lives in
// the page's memory, a reload forgets it and nobody else sees it. Each piece goes once its event exists.
import { useState } from "react";

export type LocalReply = { text: string; day: number };

export type FeedPreview = {
  likes: Record<string, true>; // "<comment id>" or "<comment id>:<reply index>" -> I like it
  like: (key: string) => void; // toggles
  replies: Record<string, LocalReply[]>; // comment id -> my replies under it
  reply: (commentId: string, r: LocalReply) => void;
  reasons: Record<string, "ask" | "done">; // case id -> the one-tap reasons are showing / were answered
  setReason: (caseId: string, v: "ask" | "done") => void;
};

export function useFeedPreview(): FeedPreview {
  const [likes, setLikes] = useState<Record<string, true>>({});
  const [replies, setReplies] = useState<Record<string, LocalReply[]>>({});
  const [reasons, setReasons] = useState<Record<string, "ask" | "done">>({});
  return {
    likes, like: (k) => setLikes((s) => { const n = { ...s }; if (n[k]) delete n[k]; else n[k] = true; return n; }),
    replies, reply: (id, r) => setReplies((s) => ({ ...s, [id]: [...(s[id] ?? []), r] })),
    reasons, setReason: (id, v) => setReasons((s) => ({ ...s, [id]: v })),
  };
}
