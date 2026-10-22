/**
 * Score gauge tile (0-100) and the five-across row.
 * @startingPoint section="System" subtitle="Five AI score gauges" viewport="900x200"
 */
export interface ScoreGaugeProps { label: string; value: number; open?: boolean; onToggle?: () => void }
export function ScoreGauge(props: ScoreGaugeProps): JSX.Element;
export interface ScoreRowProps { scores: { label: string; value: number }[]; open?: string; onToggle?: (label: string) => void }
export function ScoreRow(props: ScoreRowProps): JSX.Element;
