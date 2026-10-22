/** Segmented nav with a sliding ink thumb. */
export interface NavPillProps {
  items: { label: string; key?: string; count?: number }[];
  /** key (or label) of the current place */
  value: string;
  onChange?: (key: string) => void;
}
export function NavPill(props: NavPillProps): JSX.Element;
