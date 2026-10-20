// The data map as inline SVG: three columns (comes from, stored in, read by) and a line for every
// edge in features/admin/data-map.ts. The layout is computed there; this only draws it.
import { COLUMN_TITLE, mapLayout, type MapColumn } from "@/features/admin/data-map";
import styles from "@/app/admin/admin.module.css";

const COLUMNS: readonly MapColumn[] = ["from", "stored", "read"];

export function DataMap() {
  const m = mapLayout();
  const bend = (x1: number, x2: number) => (x2 - x1) / 2;
  return (
    <div className={styles.mapWrap}>
      <svg
        className={styles.map}
        viewBox={`0 0 ${m.width} ${m.height}`}
        role="img"
        aria-label="Where company data comes from, where it is stored and what reads it"
      >
        {COLUMNS.map((c, i) => (
          <text key={c} x={i * (m.nodeWidth + (m.width - 3 * m.nodeWidth) / 2) + m.nodeWidth / 2} y={16} textAnchor="middle" className={styles.mapHead}>
            {COLUMN_TITLE[c]}
          </text>
        ))}
        {m.lines.map((l) => (
          <path
            key={l.from + ">" + l.to}
            className={styles.mapLine}
            d={`M${l.x1},${l.y1} C${l.x1 + bend(l.x1, l.x2)},${l.y1} ${l.x2 - bend(l.x1, l.x2)},${l.y2} ${l.x2},${l.y2}`}
          />
        ))}
        {m.nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} data-column={n.column} className={styles.mapNode}>
            <rect width={m.nodeWidth} height={m.nodeHeight} rx={10} />
            <text x={12} y={22} className={styles.mapLabel}>{n.label}</text>
            <text x={12} y={40} className={styles.mapDetail}>{n.detail}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
