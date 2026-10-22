import * as React from "react";
/** Grey label/value grid. */
export interface InfoPanelProps { rows: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] }
export function InfoPanel(props: InfoPanelProps): JSX.Element;
export interface BarsPanelProps {
  title?: string;
  /** value 0-1 fills the blue bar; display is the right-hand text */
  rows: { label: string; value: number; display: string }[];
  note?: React.ReactNode;
}
export function BarsPanel(props: BarsPanelProps): JSX.Element;
