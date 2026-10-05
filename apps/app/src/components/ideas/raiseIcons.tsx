// The raise page's icons: the design's 24×24 stroke paths, round caps. One <Icon> draws any of them.
export const PATH = {
  idea: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z",
  receiver: "M6.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M17 8.5l2 2 3.5-3.5",
  colleague: "M6.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M19 7v6M16 10h6",
  meeting: "M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-10A2.5 2.5 0 0 1 6 5zM3.5 10h17M8 3v4M16 3v4",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  file: "M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5",
  affected: "M6 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 19c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3 4.6",
  vis: "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  globe: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  down: "M6 9l6 6 6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
  pencil: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z",
  sidebar: "M9.5 4.5v15",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  sparkle: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
} as const;
export type IconName = keyof typeof PATH;

export function Icon({ name, size, stroke = "currentColor", width = 1.9, className }: { name: IconName; size: number; stroke?: string; width?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "sidebar" && <rect x="3.5" y="4.5" width="17" height="15" rx="3" />}
      <path d={PATH[name]} />
    </svg>
  );
}

// Filled glyphs: the bolt on the actions button, the four-point sparkle of the AI.
export function Solid({ name, size, fill = "currentColor", className }: { name: "bolt" | "sparkle"; size: number; fill?: string; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={PATH[name]} fill={fill} /></svg>;
}

export function Mic({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
    </svg>
  );
}

export function Search({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
}
