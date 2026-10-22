import React from "react";
const TONES = ["blue", "green", "amber", "violet", "teal"];
/** The tint a person keeps on every page, picked from their name. Anonymous people get the grey. */
export function AvatarTone(name) {
  const n = (name || "").trim();
  if (!n || n === "—" || n === "?" || n.startsWith("Anonymous")) return undefined;
  return TONES[[...n].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];
}
export function Initials(name) {
  if (!name || name.startsWith("Anonymous")) return "?";
  return name.replace(/\./g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
/** Initials in a circle, tinted per person. */
export function Avatar({ name, size, tone }) {
  return <span className="nh-ui-avatar" data-size={size} data-tone={tone} data-avatar={tone ? undefined : AvatarTone(name)} title={name}>{Initials(name)}</span>;
}
