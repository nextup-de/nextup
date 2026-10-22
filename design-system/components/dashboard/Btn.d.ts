import * as React from "react";
/** Action button inside cards (decision rows). */
export interface BtnProps {
  kind?: "primary" | "accent" | "disabled" | "muted";
  onClick?: () => void;
  /** Don't stretch to share the row */
  fixed?: boolean;
  children: React.ReactNode;
}
export function Btn(props: BtnProps): JSX.Element;
