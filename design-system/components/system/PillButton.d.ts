import * as React from "react";
/**
 * Pill button of the new system (36px; sm 32, xs 24, lg 44).
 * @startingPoint section="System" subtitle="Black, grey, white and outline pills" viewport="700x200"
 */
export interface PillButtonProps {
  /** dark #111 (primary) · fill #f2f2f7 · light white on the Ground · outline (done state) · ghost hairline */
  variant?: "dark" | "fill" | "light" | "outline" | "ghost";
  size?: "xs" | "sm" | "lg";
  block?: boolean;
  icon?: React.ReactNode;
  /** Tabular count after the label at 75% opacity */
  count?: number;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function PillButton(props: PillButtonProps): JSX.Element;
