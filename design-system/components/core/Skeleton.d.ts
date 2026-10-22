import * as React from "react";
/** Loading placeholder brick. */
export interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  /** sm text lines, md/lg cards, pill chips, circle avatars */
  r?: "sm" | "md" | "lg" | "pill" | "circle";
  /** On a dark or blue panel: a light wash instead of grey */
  dark?: boolean;
  style?: React.CSSProperties;
}
export function Skeleton(props: SkeletonProps): JSX.Element;
