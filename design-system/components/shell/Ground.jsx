import React from "react";
/** The surface under every page: four soft blue blobs drifting under a grain, plus a faint dot grid. */
export function Ground({ contained, dots = 0.2, spacing = 42 }) {
  return (
    <div className="nh-ground" data-contained={contained ? "true" : undefined} aria-hidden="true" style={{ "--dots-strength": dots, "--dot-spacing": spacing + "px" }}>
      <span className="b1" /><span className="b2" /><span className="b3" /><span className="b4" />
      <span className="grain" /><span className="dots" />
    </div>
  );
}
