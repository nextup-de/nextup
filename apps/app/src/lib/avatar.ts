// The tint behind a person's initials: one of five, picked by name so a person keeps theirs on every
// page. Anonymous people and "nobody" get none (the grey fallback). Colours: [data-avatar] in globals.css.
const TONES = ["blue", "green", "amber", "violet", "teal"] as const;
export type AvatarTone = (typeof TONES)[number];

export function avatarTone(name: string): AvatarTone | undefined {
  const n = name.trim();
  if (!n || n === "—" || n === "?" || n.startsWith("Anonymous")) return undefined;
  return TONES[[...n].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];
}
