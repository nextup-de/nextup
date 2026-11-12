// The two quiet rules every page follows. A number that is 0 or missing is not shown at all - no "0", no
// dash. A list longer than LIST_FITS shows its LIST_TOP most relevant items, in the order it was given,
// and says how many more there are.

export const LIST_FITS = 7;
export const LIST_TOP = 5;

/** True when the number has something to say: a real number that is not 0. */
export const shows = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n !== 0;

/** The items to show and how many stay behind "Show all". `open` shows them all. */
export function capped<T>(list: readonly T[], open: boolean): { shown: T[]; hidden: number } {
  if (open || list.length <= LIST_FITS) return { shown: list.slice(), hidden: 0 };
  return { shown: list.slice(0, LIST_TOP), hidden: list.length - LIST_TOP };
}
