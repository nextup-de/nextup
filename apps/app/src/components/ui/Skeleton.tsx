// One grey box. Every skeleton page is built from these - the shapes live next to the views
// (src/components/dashboard/shared/PageSkeleton.tsx), this is only the brick.
import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

type Props = {
  w?: CSSProperties["width"];
  h?: CSSProperties["height"];
  /** Corner: sm (default) for text lines, md/lg for cards, pill for chips, circle for avatars. */
  r?: "sm" | "md" | "lg" | "pill" | "circle";
  /** On a dark or coloured panel the box is a light wash, not grey. */
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ w, h = 14, r = "sm", dark, className, style }: Props) {
  return (
    <span
      className={[styles.box, dark ? styles.dark : "", className ?? ""].join(" ").trim()}
      data-r={r}
      style={{ width: w, height: h, ...style }}
      aria-hidden="true"
    />
  );
}
