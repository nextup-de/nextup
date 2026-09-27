// The server's configuration, as rows - decided in features/admin/environment.ts.
import type { EnvRow } from "@/features/admin/environment";
import styles from "@/app/admin/admin.module.css";

export function EnvironmentCard({ rows }: { rows: EnvRow[] }) {
  return (
    <ul className={styles.envList}>
      {rows.map((r) => (
        <li key={r.label} data-tone={r.tone}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.envLabel}>{r.label}</span>
          <span>
            {r.value}
            {r.hint ? <span className={styles.rowMeta}> - {r.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
