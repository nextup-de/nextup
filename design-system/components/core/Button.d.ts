import * as React from "react";
/**
 * Full-width form button (login, settings): black primary, white ghost, grey fill.
 * @startingPoint section="Core" subtitle="Primary, ghost and small buttons" viewport="700x260"
 */
export interface ButtonProps {
  /** primary = black #111 · ghost = white with #e5e5ea hairline · fill = grey #f2f2f7 · accent = alias of primary */
  variant?: "primary" | "ghost" | "fill" | "accent";
  /** md = 44px, sm = 34px */
  size?: "sm" | "md";
  block?: boolean;
  /** Renders an <a> when set */
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
