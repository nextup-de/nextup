/** Side card with feed support, comments and a comment input. */
export interface FeedPanelProps { supporters?: number; comments?: number; line?: string; onPost?: (text: string) => void }
export function FeedPanel(props: FeedPanelProps): JSX.Element;
