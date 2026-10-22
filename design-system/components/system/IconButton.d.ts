import * as React from "react";
/** Circular (or outlined square) icon button, 32px (sm 24, lg 40). */
export interface IconButtonProps {
  variant?: "dark" | "fill" | "ghost" | "outline";
  size?: "sm" | "lg";
  /** aria-label + tooltip - required, the button has no text */
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}
export function IconButton(props: IconButtonProps): JSX.Element;
