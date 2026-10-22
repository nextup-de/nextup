import * as React from "react";
/** NextUp logo from the brand files (assets/brand/nextup-<layout>-<tone>.png). */
export interface WordmarkProps {
  /** Path to assets/brand/ relative to the page, with trailing slash. Default "assets/brand/" */
  base?: string;
  /** horizontal = mark + name side by side (app bar, login) · stacked = name under the mark · mark = the star alone */
  layout?: "horizontal" | "stacked" | "mark";
  /** blue = blue mark + black name (default, on light) · black · white (on dark/photo) · blue-white = blue mark + white name (on dark). mark has black | white | blue only. */
  tone?: "blue" | "black" | "white" | "blue-white";
  /** px; width follows the file's aspect */
  height?: number;
  style?: React.CSSProperties;
}
export function Wordmark(props: WordmarkProps): JSX.Element;
