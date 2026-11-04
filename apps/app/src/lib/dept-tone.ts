// A department's tint: one of six, picked by its name so a department keeps it on every page. "Production,
// Line 3" and "Production" are one department. Colours: [data-dept-tone] in globals.css.
const TONES = ["blue", "green", "amber", "violet", "teal", "pink"] as const;
export type DeptTone = (typeof TONES)[number];

export function deptTone(name: string): DeptTone | undefined {
  const dept = name.split(/[,·]/)[0].trim().toLowerCase();
  if (!dept || dept === "—") return undefined;
  return TONES[[...dept].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];
}
