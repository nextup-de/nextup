// The ground under every page: four soft blue blobs drifting under a grain, fixed behind the
// whole viewport. Came from the raise page (the NextUp mockup); the shells render it once so
// every page sits on the same surface. Purely decorative - nothing here is read by anyone.
// On top: the dot grid (features/design/dots). The default comes from config; the dev panel can
// override it per browser by setting --dots-strength / --dot-spacing on <html>.
import { DOTS_DEFAULT } from "@/features/design/dots";
import styles from "./Ground.module.css";

const dotDefaults = { "--dots-default-strength": DOTS_DEFAULT.dotsStrength, "--dots-default-spacing": DOTS_DEFAULT.dotSpacing + "px" } as React.CSSProperties;

export function Ground() {
  return (
    <div className={styles.ground} style={dotDefaults} aria-hidden="true">
      <span className={styles.blob1} /><span className={styles.blob2} /><span className={styles.blob3} /><span className={styles.blob4} />
      <span className={styles.grain} />
      <span className={styles.dots} />
    </div>
  );
}
