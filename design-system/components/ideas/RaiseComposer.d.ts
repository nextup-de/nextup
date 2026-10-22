/**
 * The Raise page's gold-ringed composer with prompt tray.
 * @startingPoint section="Ideas" subtitle="Gold-ring idea composer" viewport="800x260"
 */
export interface RaiseComposerProps {
  value?: string;
  onChange?: (v: string) => void;
  /** Enter or the send button; needs 3+ characters */
  onSubmit?: (v: string) => void;
  placeholder?: string;
  /** Attachments under the field: people, meetings, affected departments */
  chips?: { title: string; sub: string; kind: "person" | "meeting" | "file" | "affected" | "private" | "custom"; icon?: string; tone?: "blue" | "green" | "amber" | "violet" | "teal" }[];
  /** The grey prompt tray tucked under the card (Custom, Impact, Who's blocked, ...) */
  tray?: boolean;
  onPreset?: (label: string) => void;
}
export function RaiseComposer(props: RaiseComposerProps): JSX.Element;
