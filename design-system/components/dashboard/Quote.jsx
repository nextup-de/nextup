import React from "react";
/** What someone actually said, with who said it - a 2px rule on the left. */
export function Quote({ text, by, tone }) {
  return (
    <div className="nh-ui-quote" data-tone={tone}>
      <div className="nh-ui-quote-text">{text}</div>
      <div className="nh-ui-quote-by">{by}</div>
    </div>
  );
}
