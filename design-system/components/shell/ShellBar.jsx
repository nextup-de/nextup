import React from "react";
import { Wordmark } from "./Wordmark.jsx";
import { NavPill } from "./NavPill.jsx";
import { Icon } from "../icons/Icon.jsx";
/** The app's one bar: wordmark left, search + places centre, the "me" button right. Frosted white. */
export function ShellBar({ logoBase, items, value, onChange, me = "JS", onMe, onLogo, search = true }) {
  return (
    <header className="nh-bar">
      <span className="nh-bar-brand" onClick={onLogo}><Wordmark base={logoBase} height={28} /></span>
      <div className="nh-bar-center">
        {search && <button type="button" className="nh-bar-search" aria-label="Search"><Icon name="search" size={14} color="#8e8e93" width={2.4} /></button>}
        <NavPill items={items} value={value} onChange={onChange} />
      </div>
      <div className="nh-bar-right"><button type="button" className="nh-me" onClick={onMe} aria-label="Profile">{me}</button></div>
    </header>
  );
}
