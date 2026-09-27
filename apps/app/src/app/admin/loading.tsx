// Grey boxes while the company list and the pilot requests come out of Postgres.
import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./admin.module.css";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {[0, 1].map((i) => (
        <section key={i} className={styles.card}>
          <Skeleton w={160} h={22} />
          <Skeleton w="60%" h={12} style={{ marginTop: 10 }} />
          {[0, 1, 2].map((j) => (
            <Skeleton key={j} w="100%" h={44} r="md" style={{ marginTop: j === 0 ? 18 : 8 }} />
          ))}
        </section>
      ))}
    </div>
  );
}
