import React from "react";
/** The segmented place switcher: an ink thumb slides under the current place; counts in a grey capsule. */
export function NavPill({ items, value, onChange }) {
  const ref = React.useRef(null);
  const [thumb, setThumb] = React.useState(null);
  React.useLayoutEffect(() => {
    const nav = ref.current; if (!nav) return;
    const m = () => { const on = nav.querySelector('[data-active="true"]'); setThumb(on ? { x: on.offsetLeft, w: on.offsetWidth } : null); };
    m(); const ro = new ResizeObserver(m); ro.observe(nav); return () => ro.disconnect();
  }, [value, items.length]);
  return (
    <nav ref={ref} className="nh-nav" aria-label="Main">
      {thumb && <span className="nh-nav-thumb" style={{ transform: "translateX(" + thumb.x + "px)", width: thumb.w }} aria-hidden="true" />}
      {items.map((n) => {
        const key = n.key ?? n.label, on = key === value;
        return (
          <button key={key} type="button" className="nh-nav-item" data-active={on ? "true" : undefined} aria-current={on ? "page" : undefined} onClick={() => onChange && onChange(key)}>
            {n.label}{n.count > 0 && <span className="nh-nav-count">{n.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
