"use client";
// Stand-ins for what a draft cannot store yet - the list for Kevin is RAISE-FOR-KEVIN.txt. The
// screens are the real ones; this state is not: it lives in the page's memory (lib/use-kept.ts, per
// company and person, so it is still there after a visit to another page), a reload forgets it and
// nobody else sees it. Each piece goes once the draft (or the case.raised payload) has a field.
// Keyed by the page's slot: a draft id, or the start form's own key for the draft it made.
import { useKept } from "@/lib/use-kept";

export type Meeting = { dur: string; when: string };
export type Visibility = "private" | "public" | "custom";
export type Extras = { recv: string[]; coll: string[]; meet: Meeting | null; vis: Visibility; visTo: string[] };
export type IdeaEdit = { orig: string; text: string }; // the first message as sent, and as the author has since edited it
export type FileItem = { id: string; name: string; url: string; img: boolean; file: File };

export const NO_EXTRAS: Extras = { recv: [], coll: [], meet: null, vis: "public", visTo: [] };

export type RaisePreview = {
  extras: (key: string) => Extras;
  setExtras: (key: string, next: Partial<Extras>) => void;
  pinned: string[];
  togglePin: (id: string) => void;
  unknown: Record<string, string[]>; // draft id -> questions answered "not sure"
  markUnknown: (id: string, ask: string) => void;
  edits: Record<string, IdeaEdit>; // draft id -> the idea as edited in the Idea view
  edit: (id: string, e: IdeaEdit | null) => void; // null: undo
  suggested: Record<string, "yes" | "no">; // "<draft id>:<turn id>" -> what the author did with "Update your idea?"
  resolve: (key: string, v: "yes" | "no") => void;
};

const NONE = {};

export function useRaisePreview(scope: string): RaisePreview {
  const [extras, setAll] = useKept<Record<string, Extras>>(scope, "extras", NONE);
  const [pinned, setPinned] = useKept<string[]>(scope, "pinned", []);
  const [unknown, setUnknown] = useKept<Record<string, string[]>>(scope, "unknown", NONE);
  const [edits, setEdits] = useKept<Record<string, IdeaEdit>>(scope, "edits", NONE);
  const [suggested, setSuggested] = useKept<Record<string, "yes" | "no">>(scope, "suggested", NONE);
  return {
    extras: (key) => extras[key] ?? NO_EXTRAS,
    setExtras: (key, next) => setAll((s) => ({ ...s, [key]: { ...(s[key] ?? NO_EXTRAS), ...next } })),
    pinned, togglePin: (id) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    unknown, markUnknown: (id, ask) => setUnknown((s) => ({ ...s, [id]: [...(s[id] ?? []).filter((x) => x !== ask), ask] })),
    edits, edit: (id, e) => setEdits((s) => { const n = { ...s }; if (e && e.text !== e.orig) n[id] = e; else delete n[id]; return n; }),
    suggested, resolve: (key, v) => setSuggested((s) => ({ ...s, [key]: v })),
  };
}
