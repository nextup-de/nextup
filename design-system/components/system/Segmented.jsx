import React from "react";
/** Two-to-four tabs in one track. grey = white thumb (Idea / AI); white = black thumb (Open / Archive). */
export function Segmented({ items, value, onChange, tone = "grey" }) {
  return (
    <div className="nu-seg" data-tone={tone} role="tablist">
      {items.map((it) => {
        const key = it.key ?? it.label, on = key === value;
        return <button key={key} type="button" role="tab" aria-selected={on} className="nu-seg-item" data-on={on ? "true" : undefined} onClick={() => onChange && onChange(key)}>{it.icon}{it.label}{it.count != null && <span className="nu-seg-count">{it.count}</span>}</button>;
      })}
    </div>
  );
}
