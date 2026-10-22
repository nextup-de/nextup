/**
 * The leader's decision card.
 * @startingPoint section="System" subtitle="Your decision - yes, discuss, no, pass, ask" viewport="360x340"
 */
export interface DecisionListProps {
  title?: string;
  /** e.g. ["Yes, do it","Discuss first","No, and why","Pass to Markus Roth","Ask a question"] */
  options: string[];
  value?: string;
  /** the option the AI recommends - gets the "+ AI suggests" tag */
  suggested?: string;
  onPick?: (option: string) => void;
}
export function DecisionList(props: DecisionListProps): JSX.Element;
