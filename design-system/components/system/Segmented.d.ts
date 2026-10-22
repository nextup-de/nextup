import * as React from "react";
/** Segmented tabs. */
export interface SegmentedProps {
  items: { label: string; key?: string; count?: number; icon?: React.ReactNode }[];
  value: string;
  onChange?: (key: string) => void;
  /** grey track + white thumb, or white track + black thumb */
  tone?: "grey" | "white";
}
export function Segmented(props: SegmentedProps): JSX.Element;
