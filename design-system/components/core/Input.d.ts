import * as React from "react";
/** The nh-input text field (also textarea and select). */
export interface InputProps {
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  /** Red border, red focus ring */
  invalid?: boolean;
  /** Renders a resizable textarea, min 120px */
  multiline?: boolean;
  rows?: number;
  /** Renders a native select with the chevron */
  select?: boolean;
  options?: string[];
  /** Grey mono suffix box joined to the right edge, e.g. ".nextup.app" */
  suffix?: string;
  style?: React.CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
