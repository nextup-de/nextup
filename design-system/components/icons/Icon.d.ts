import * as React from "react";
export type IconName = "idea" | "receiver" | "colleague" | "meeting" | "file" | "affected" | "vis" | "lock" | "globe" | "check" | "x" | "right" | "left" | "down" | "up" | "upload" | "download" | "plus" | "pencil" | "sidebar" | "bolt" | "sparkle" | "mic" | "search" | "sort" | "filter" | "pin" | "comment";
/**
 * The product's own 24×24 round-cap stroke icon set.
 * @startingPoint section="Core" subtitle="NextUp stroke icon set" viewport="700x220"
 */
export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Stroke width; product default 1.9, small glyphs up to 2.6-3 */
  width?: number;
  /** Fill instead of stroke (bolt, sparkle) */
  solid?: boolean;
  style?: React.CSSProperties;
}
export function Icon(props: IconProps): JSX.Element;
export const IconPaths: Record<IconName, string>;
