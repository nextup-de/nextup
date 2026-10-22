/** Seven-bar sparkline (first three bars grey = before the baseline). */
export interface BarsProps {
  /** Seven values 0-1 */
  spark?: number[];
  tone?: "light";
  size?: "md" | "lg";
  /** All bars at a flat 15%, hairline colour - no data yet */
  flat?: boolean;
}
export function Bars(props: BarsProps): JSX.Element;
