// The tint behind a person's initials: one of six, picked by name so a person keeps theirs on every
// page, however the name is written: "T. Vogel" and "Thomas Vogel" are one person. Anonymous people and
// "nobody" get none (the grey fallback). Colours: [data-avatar] in globals.css.
const TONES = ["blue", "green", "amber", "violet", "teal", "pink"] as const;
export type AvatarTone = (typeof TONES)[number];
/** FNV-1a: the old "times 31" kept only the sum of the letters modulo six, so most names landed on few tones. */
export const hashOf = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return (h ^ (h >>> 15)) >>> 0; };

/** First initial and last name, which is what the short and the full form of a name share. */
const personKey = (name: string) => {
  const words = name.toLowerCase().split(/[\s.]+/).filter(Boolean);
  return words.length > 1 ? `${words[0][0]} ${words[words.length - 1]}` : (words[0] ?? "");
};

export function avatarTone(name: string): AvatarTone | undefined {
  const n = name.trim();
  if (!n || n === "—" || n === "?" || n.startsWith("Anonymous")) return undefined;
  return TONES[hashOf(personKey(n)) % TONES.length];
}
