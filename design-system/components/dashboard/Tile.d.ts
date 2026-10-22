import * as React from "react";
/** A number + label inside a card, hairline above. */
export interface TileProps { v: React.ReactNode; l: string; hot?: boolean; onClick?: () => void }
export function Tile(props: TileProps): JSX.Element;
export interface StatsProps { items: { v: React.ReactNode; l: string; hot?: boolean }[] }
/** A strip of numbers in one box with hairlines between. */
export function Stats(props: StatsProps): JSX.Element;
