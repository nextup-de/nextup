// What the raise page offers (D14) and where a raise goes (D13). Pure.
import type { Desk } from "./desks";

// The actions menu and the start page's action row: attach a file, who is affected, who sees it.
export const RAISE_ACTIONS = ["file", "affected", "vis"] as const;
export type RaiseAction = (typeof RAISE_ACTIONS)[number];

// A raise to a desk sends that desk's route; the server stamps the owner seat (features/cases/stamp.ts).
export const raiseTarget = (desk: Desk | null): { routeId: string | null } => ({ routeId: desk ? desk.routeId : null });
