import * as React from "react";
/** Pill toggle button (36px, or 32px sm). */
export interface ToggleProps {
  /** dark = #111 fill; light = white; outline = the done/"Supported" state */
  tone?: "dark" | "light" | "outline";
  size?: "sm";
  icon?: React.ReactNode;
  count?: number;
  onClick?: () => void;
  ariaLabel?: string;
  children?: React.ReactNode;
}
export function Toggle(props: ToggleProps): JSX.Element;
export interface FilterChipProps { on?: boolean; count?: number; onClick?: () => void; children: React.ReactNode }
/** White filter chip that turns black when on. */
export function FilterChip(props: FilterChipProps): JSX.Element;
