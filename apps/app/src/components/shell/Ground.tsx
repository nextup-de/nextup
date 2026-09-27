// The ground under every page: four soft blue blobs drifting under a grain, fixed behind the
// whole viewport. Came from the raise page (the NextUp mockup); the shells render it once so
// every page sits on the same surface. Purely decorative - nothing here is read by anyone.
import styles from "./Ground.module.css";

export function Ground() {
  return (
    <div className={styles.ground} aria-hidden="true">
      <span className={styles.blob1} /><span className={styles.blob2} /><span className={styles.blob3} /><span className={styles.blob4} />
      <span className={styles.grain} />
    </div>
  );
}
