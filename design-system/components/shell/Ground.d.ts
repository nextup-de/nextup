/**
 * Fixed decorative background: blue blobs, grain and dot grid.
 * @startingPoint section="Shell" subtitle="The blue Ground every page sits on" viewport="700x300"
 */
export interface GroundProps {
  /** position:absolute inside the parent instead of fixed to the viewport */
  contained?: boolean;
  /** Dot grid opacity, default 0.2 (0 hides it) */
  dots?: number;
  /** Dot spacing in px, default 42 */
  spacing?: number;
}
export function Ground(props: GroundProps): JSX.Element;
