/**
 * Five-step progress track + desk strip.
 * @startingPoint section="System" subtitle="Raised → AI check → Team lead → Decision → In progress" viewport="900x180"
 */
export interface StepTrackProps { steps: { label: string; sub: string; tone: "done" | "now" | "todo" }[] }
export function StepTrack(props: StepTrackProps): JSX.Element;
export interface DeskStripProps {
  name: string; role: string; initials: string;
  tone?: "blue" | "green" | "amber" | "violet" | "teal";
  /** share of the 5-day promise used (0-1; over 1 turns red) */
  used?: number;
  label: string;
}
export function DeskStrip(props: DeskStripProps): JSX.Element;
