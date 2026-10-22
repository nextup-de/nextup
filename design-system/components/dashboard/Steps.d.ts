/** Sent → Read → Answered → Live progress bars. */
export interface StepsProps {
  steps: { label: string; when: string; tone: "done" | "now" | "late" | "todo" }[];
}
export function Steps(props: StepsProps): JSX.Element;
