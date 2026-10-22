import * as React from "react";
/**
 * Tinted badge of the new system.
 * @startingPoint section="System" subtitle="Status badges" viewport="700x140"
 */
export interface BadgeProps {
  /** left = "2 d left" blue · late = "3 d late" grey · hot = red · review = "Under review"/"Needs info" amber · piloting · approved · dark · onblue (on the selected row). Omit for neutral grey. */
  tone?: "left" | "late" | "hot" | "review" | "piloting" | "approved" | "dark" | "onblue";
  /** md = 13px (detail header) */
  size?: "md";
  children: React.ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;
