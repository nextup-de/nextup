/** Chat line for the coach chat and person threads. */
export interface ChatMessageProps {
  role?: "user" | "ai" | "them";
  text: string;
  /** role="them": the person's initials and avatar tint */
  initials?: string;
  tone?: "blue" | "green" | "amber" | "violet" | "teal";
  when?: string;
}
export function ChatMessage(props: ChatMessageProps): JSX.Element;
export interface ProgressRailProps { count: number; current: number; onPick?: (turn: number) => void }
/** Vertical rail of turn pills - checks for done, the current turn tall and black. */
export function ProgressRail(props: ProgressRailProps): JSX.Element;
