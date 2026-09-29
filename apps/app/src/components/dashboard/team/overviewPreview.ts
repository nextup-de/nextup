"use client";
// Stand-ins for what the event log cannot record yet - the list for Kevin is the Overview handoff
// note. The screens are the real ones; this state is not: it lives in the page's memory, a reload
// forgets it and nobody else sees it. Each piece goes once its event exists. Facts only - the
// sentences are built where they are shown.
import { useState } from "react";

export type IdeaFile = { name: string; ext: string; meta: string };
export type IdeaEdit = { description: string; context: string; prompts: { label: string; text: string }[]; affects: string[]; files: IdeaFile[] };
export type RespondKey = "accept" | "accept-start" | "owner" | "second"; // what the raiser did with the lead's answer
export type Response = { key: RespondKey; text: string };
export type LocalMsg = { text: string; file: string | null; day: number }; // a message or an attachment only this browser has seen

export type Preview = {
  edits: Record<string, IdeaEdit>; // case id -> the idea as last saved
  saveEdit: (caseId: string, e: IdeaEdit) => void;
  responses: Record<string, Response>; // case id -> the answer to the lead's answer
  respond: (caseId: string, r: Response | null) => void; // null: undo
  chats: Record<string, string[]>; // case id -> the people a chat was started with
  startChat: (caseId: string, name: string) => void;
  msgs: Record<string, LocalMsg[]>; // "<case id>:<thread>" -> what was sent there
  send: (caseId: string, thread: string, m: LocalMsg) => void;
  replies: Record<string, LocalMsg[]>; // "<case id>:<comment index>" -> replies under a feed comment
  reply: (caseId: string, comment: number, m: LocalMsg) => void;
};

export function usePreview(): Preview {
  const [edits, setEdits] = useState<Record<string, IdeaEdit>>({});
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [chats, setChats] = useState<Record<string, string[]>>({});
  const [msgs, setMsgs] = useState<Record<string, LocalMsg[]>>({});
  const [replies, setReplies] = useState<Record<string, LocalMsg[]>>({});
  return {
    edits, saveEdit: (id, e) => setEdits((s) => ({ ...s, [id]: e })),
    responses, respond: (id, r) => setResponses((s) => { const n = { ...s }; if (r) n[id] = r; else delete n[id]; return n; }),
    chats, startChat: (id, name) => setChats((s) => ({ ...s, [id]: [...(s[id] ?? []).filter((n) => n !== name), name] })),
    msgs, send: (id, thread, m) => setMsgs((s) => ({ ...s, [id + ":" + thread]: [...(s[id + ":" + thread] ?? []), m] })),
    replies, reply: (id, i, m) => setReplies((s) => ({ ...s, [id + ":" + i]: [...(s[id + ":" + i] ?? []), m] })),
  };
}
