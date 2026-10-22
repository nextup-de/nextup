import * as React from "react";
export type PillTone = "accent" | "ink" | "ok" | "grey" | "soft" | "ghost" | "none" | "purple";
/**
 * Status / trend / reason pill (7px corners, 12px bold).
 * @startingPoint section="Dashboard" subtitle="Status pills in every tone" viewport="700x200"
 */
export interface PillProps { tone?: PillTone; children: React.ReactNode }
export function Pill(props: PillProps): JSX.Element;
export function StatusTone(status: string): PillTone;
