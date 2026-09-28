// The idea's score as a ring of four coloured quarters, one per benchmark, each filled as far as
// its bar - so the ring shows at a glance which part of the idea is still thin. Overall in the
// middle. Pure SVG, no state.
import type { BenchmarkPart } from "@/features/ideas/benchmarks";
import styles from "./IdeaStudio.module.css";

const ORDER = ["fit", "impact", "feasibility", "clarity"] as const;

export function ScoreRing({ parts, overall, size, label = true }: { parts: readonly BenchmarkPart[]; overall: number; size: number; label?: boolean }) {
  const stroke = Math.max(3, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = size >= 60 ? 6 : 3; // space between the quarters, in px of arc
  const seg = c / 4 - gap;
  const value = (id: (typeof ORDER)[number]) => parts.find((p) => p.id === id)?.value ?? 0;
  return (
    <span className={styles.ring} style={{ width: size, height: size }} role="img" aria-label={"Score " + overall + " of 100"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {ORDER.map((id, i) => {
          const off = -(i * (c / 4) + gap / 2);
          const fill = (seg * value(id)) / 100;
          return (
            <g key={id} data-bench={id} className={styles.ringSeg} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={styles.ringTrack} strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={off} />
              {fill > 0.5 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={styles.ringFill} strokeDasharray={`${fill} ${c - fill}`} strokeDashoffset={off} />}
            </g>
          );
        })}
      </svg>
      {label && <span className={styles.ringNum} style={{ fontSize: Math.round(size * 0.3) }}>{overall}</span>}
    </span>
  );
}
