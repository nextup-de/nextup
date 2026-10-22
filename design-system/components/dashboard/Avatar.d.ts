/** Person initials in a tinted circle (blue/green/amber/violet/teal, picked by name). */
export interface AvatarProps {
  name: string;
  /** sm 21px, default 26px, lg 34px, xl 40px (inbox rows) */
  size?: "sm" | "lg" | "xl";
  /** light = on a dark panel; ink = the signed-in "me" button */
  tone?: "light" | "ink";
}
export function Avatar(props: AvatarProps): JSX.Element;
export function AvatarTone(name: string): "blue" | "green" | "amber" | "violet" | "teal" | undefined;
export function Initials(name: string): string;
