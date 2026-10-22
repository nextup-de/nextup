import * as React from "react";
/**
 * Label + input + optional hint or error (error replaces the hint).
 * @startingPoint section="Core" subtitle="Form field with label, hint and error" viewport="700x260"
 */
export interface FieldProps {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Replaces the hint; give the input aria-invalid */
  error?: React.ReactNode;
  /** Right-aligned next to the label, e.g. a "Forgot?" link */
  labelRight?: React.ReactNode;
  children: React.ReactNode;
}
export function Field(props: FieldProps): JSX.Element;
