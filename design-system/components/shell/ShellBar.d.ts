/**
 * The signed-in top bar (46px, frosted white, hairline under it).
 * @startingPoint section="Shell" subtitle="App top bar with wordmark, nav pill and profile" viewport="1100x120"
 */
export interface ShellBarProps {
  /** Path to assets/brand/ relative to the page */
  logoBase?: string;
  items: { label: string; key?: string; count?: number }[];
  value: string;
  onChange?: (key: string) => void;
  /** Initials on the ink profile button */
  me?: string;
  onMe?: () => void;
  onLogo?: () => void;
  search?: boolean;
}
export function ShellBar(props: ShellBarProps): JSX.Element;
