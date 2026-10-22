/** A quoted reply with attribution. */
export interface QuoteProps { text: string; by: string; tone?: "accent" }
export function Quote(props: QuoteProps): JSX.Element;
