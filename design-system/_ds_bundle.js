/* @ds-bundle: {"format":4,"namespace":"NextUpDesignSystem_2debbf","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Divider","sourcePath":"components/core/Divider.jsx"},{"name":"Field","sourcePath":"components/core/Field.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Skeleton","sourcePath":"components/core/Skeleton.jsx"},{"name":"AvatarTone","sourcePath":"components/dashboard/Avatar.jsx"},{"name":"Initials","sourcePath":"components/dashboard/Avatar.jsx"},{"name":"Avatar","sourcePath":"components/dashboard/Avatar.jsx"},{"name":"Bars","sourcePath":"components/dashboard/Bars.jsx"},{"name":"Btn","sourcePath":"components/dashboard/Btn.jsx"},{"name":"Empty","sourcePath":"components/dashboard/Empty.jsx"},{"name":"Pill","sourcePath":"components/dashboard/Pill.jsx"},{"name":"StatusTone","sourcePath":"components/dashboard/Pill.jsx"},{"name":"Quote","sourcePath":"components/dashboard/Quote.jsx"},{"name":"Steps","sourcePath":"components/dashboard/Steps.jsx"},{"name":"Tile","sourcePath":"components/dashboard/Tile.jsx"},{"name":"Stats","sourcePath":"components/dashboard/Tile.jsx"},{"name":"IconPaths","sourcePath":"components/icons/Icon.jsx"},{"name":"Icon","sourcePath":"components/icons/Icon.jsx"},{"name":"RaiseComposer","sourcePath":"components/ideas/RaiseComposer.jsx"},{"name":"Ground","sourcePath":"components/shell/Ground.jsx"},{"name":"NavPill","sourcePath":"components/shell/NavPill.jsx"},{"name":"ShellBar","sourcePath":"components/shell/ShellBar.jsx"},{"name":"Toggle","sourcePath":"components/shell/Toggle.jsx"},{"name":"FilterChip","sourcePath":"components/shell/Toggle.jsx"},{"name":"Wordmark","sourcePath":"components/shell/Wordmark.jsx"},{"name":"Badge","sourcePath":"components/system/Badge.jsx"},{"name":"ChatMessage","sourcePath":"components/system/ChatMessage.jsx"},{"name":"ProgressRail","sourcePath":"components/system/ChatMessage.jsx"},{"name":"DecisionList","sourcePath":"components/system/DecisionList.jsx"},{"name":"FeedPanel","sourcePath":"components/system/FeedPanel.jsx"},{"name":"IconButton","sourcePath":"components/system/IconButton.jsx"},{"name":"InfoPanel","sourcePath":"components/system/InfoPanel.jsx"},{"name":"BarsPanel","sourcePath":"components/system/InfoPanel.jsx"},{"name":"PillButton","sourcePath":"components/system/PillButton.jsx"},{"name":"ScoreGauge","sourcePath":"components/system/ScoreGauge.jsx"},{"name":"ScoreRow","sourcePath":"components/system/ScoreGauge.jsx"},{"name":"Segmented","sourcePath":"components/system/Segmented.jsx"},{"name":"StepTrack","sourcePath":"components/system/StepTrack.jsx"},{"name":"DeskStrip","sourcePath":"components/system/StepTrack.jsx"}],"sourceHashes":{"components/core/Button.jsx":"cb021d0fd83f","components/core/Divider.jsx":"9fd122554010","components/core/Field.jsx":"1a60a5dd5a81","components/core/Input.jsx":"96b179a6e2af","components/core/Skeleton.jsx":"903d39b62bfe","components/dashboard/Avatar.jsx":"c0469bd9d8dc","components/dashboard/Bars.jsx":"debc79a6ba98","components/dashboard/Btn.jsx":"ef02d33c7790","components/dashboard/Empty.jsx":"9764824b42ba","components/dashboard/Pill.jsx":"3def2987a4f3","components/dashboard/Quote.jsx":"6dd0f0e0702d","components/dashboard/Steps.jsx":"1eb43e679a97","components/dashboard/Tile.jsx":"361216ccacde","components/icons/Icon.jsx":"dba7dbe08b7f","components/ideas/RaiseComposer.jsx":"9cad34ef3faa","components/shell/Ground.jsx":"280753977684","components/shell/NavPill.jsx":"8e7904f6714d","components/shell/ShellBar.jsx":"484e35ad2168","components/shell/Toggle.jsx":"afa4ddc2cb28","components/shell/Wordmark.jsx":"93a540e14be7","components/system/Badge.jsx":"f498fee8a476","components/system/ChatMessage.jsx":"c4d749315669","components/system/DecisionList.jsx":"c7ac4a17fc80","components/system/FeedPanel.jsx":"869261e508ac","components/system/IconButton.jsx":"0f9feef4c8ef","components/system/InfoPanel.jsx":"d72dfe44f8e5","components/system/PillButton.jsx":"b89841b4d922","components/system/ScoreGauge.jsx":"11b9c002799d","components/system/Segmented.jsx":"342c61473ead","components/system/StepTrack.jsx":"b1f7a6c8458e","ui_kits/app/App.jsx":"133d1c5a6673","ui_kits/app/FeedScreen.jsx":"080abd1c0781","ui_kits/app/InboxScreen.jsx":"b315bec04c2a","ui_kits/app/LoginScreen.jsx":"30bf2d3f9867","ui_kits/app/ProjectScreen.jsx":"31b6417bb8b2","ui_kits/app/RaiseScreen.jsx":"c363dc2e7f63","ui_kits/app/SentScreen.jsx":"8fd2ab825505","ui_kits/app/data.js":"27e3fcde3f37"},"inlinedExternals":[],"unexposedExports":[{"name":"statusTone","sourcePath":"components/dashboard/Pill.jsx"}]} */

(() => {

const __ds_ns = (window.NextUpDesignSystem_2debbf = window.NextUpDesignSystem_2debbf || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
/** Form button: black primary, white hairline ghost, grey fill. 44px tall, 34px small. */
function Button({
  variant = "primary",
  size = "md",
  block,
  href,
  type = "button",
  onClick,
  disabled,
  children,
  className,
  style
}) {
  const cls = ["nh-btn", "nh-btn-" + variant, size === "sm" && "nh-btn-sm", block && "nh-btn-block", className].filter(Boolean).join(" ");
  if (href !== undefined) return /*#__PURE__*/React.createElement("a", {
    href: href,
    className: cls,
    style: style
  }, children);
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    onClick: onClick,
    disabled: disabled,
    className: cls,
    style: style
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Divider.jsx
try { (() => {
/** A hairline either side of a small word - "or" between two ways in. */
function Divider({
  children = "or"
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-divider"
  }, children);
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Divider.jsx", error: String((e && e.message) || e) }); }

// components/core/Field.jsx
try { (() => {
/** Label + control + one line under it: a hint, or an error that replaces it. */
function Field({
  id,
  label,
  hint,
  error,
  labelRight,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-field"
  }, labelRight ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline"
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "nh-label",
    htmlFor: id
  }, label), labelRight) : /*#__PURE__*/React.createElement("label", {
    className: "nh-label",
    htmlFor: id
  }, label), children, error ? /*#__PURE__*/React.createElement("p", {
    className: "nh-error",
    id: id + "-error",
    role: "alert"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 4.75v3.9M8 11.1v.15",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("span", null, error)) : hint ? /*#__PURE__*/React.createElement("p", {
    className: "nh-hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Field.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The nh-input text field: 44px, white, hairline, blue focus ring. Optional suffix (e.g. ".nextup.app"). */
function Input({
  id,
  value,
  defaultValue,
  onChange,
  placeholder,
  type = "text",
  invalid,
  multiline,
  select,
  options,
  suffix,
  rows,
  style
}) {
  const common = {
    id,
    value,
    defaultValue,
    placeholder,
    style,
    "aria-invalid": invalid ? true : undefined,
    onChange: onChange ? e => onChange(e.target.value) : undefined
  };
  let el;
  if (multiline) el = /*#__PURE__*/React.createElement("textarea", _extends({
    className: "nh-input nh-textarea",
    rows: rows
  }, common));else if (select) el = /*#__PURE__*/React.createElement("select", _extends({
    className: "nh-input nh-select"
  }, common), (options || []).map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o)));else el = /*#__PURE__*/React.createElement("input", _extends({
    className: "nh-input",
    type: type
  }, common));
  if (!suffix) return el;
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-slug"
  }, el, /*#__PURE__*/React.createElement("span", {
    className: "nh-slug-suffix"
  }, suffix));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Skeleton.jsx
try { (() => {
/** One grey pulsing box standing in for content that has not arrived. */
function Skeleton({
  w,
  h = 14,
  r = "sm",
  dark,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nh-skel",
    "data-r": r,
    "data-dark": dark ? "true" : undefined,
    style: {
      width: w,
      height: h,
      ...style
    },
    "aria-hidden": "true"
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Avatar.jsx
try { (() => {
const TONES = ["blue", "green", "amber", "violet", "teal"];
/** The tint a person keeps on every page, picked from their name. Anonymous people get the grey. */
function AvatarTone(name) {
  const n = (name || "").trim();
  if (!n || n === "—" || n === "?" || n.startsWith("Anonymous")) return undefined;
  return TONES[[...n].reduce((h, ch) => h * 31 + ch.charCodeAt(0) >>> 0, 7) % TONES.length];
}
function Initials(name) {
  if (!name || name.startsWith("Anonymous")) return "?";
  return name.replace(/\./g, " ").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
/** Initials in a circle, tinted per person. */
function Avatar({
  name,
  size,
  tone
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nh-ui-avatar",
    "data-size": size,
    "data-tone": tone,
    "data-avatar": tone ? undefined : AvatarTone(name),
    title: name
  }, Initials(name));
}
Object.assign(__ds_scope, { AvatarTone, Initials, Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Bars.jsx
try { (() => {
/** Seven-bar sparkline. Grey bars = before the baseline, ink = since. Values 0-1. */
function Bars({
  spark = [],
  tone,
  size,
  flat
}) {
  const vals = flat ? [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] : spark;
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-bars",
    "data-size": size
  }, vals.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "nh-ui-bar",
    "data-tone": flat ? "flat" : tone ?? (i < 3 ? "before" : undefined),
    style: {
      height: 4 + v * 20
    }
  })));
}
Object.assign(__ds_scope, { Bars });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Bars.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Btn.jsx
try { (() => {
/** The decision row's buttons: equal widths, 10px-ish corners, blue for the one that moves it on. */
function Btn({
  kind,
  onClick,
  children,
  fixed
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-ui-btn",
    "data-kind": kind,
    "data-fixed": fixed ? "true" : undefined,
    onClick: kind === "disabled" ? undefined : onClick,
    disabled: kind === "disabled"
  }, children);
}
Object.assign(__ds_scope, { Btn });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Btn.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Empty.jsx
try { (() => {
/** An empty state: one bold line and one quiet line saying what happens next. */
function Empty({
  title,
  sub,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-empty-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-empty-sub"
  }, sub), children);
}
Object.assign(__ds_scope, { Empty });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Empty.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Pill.jsx
try { (() => {
/** Status pill. Amber = waiting on someone, green = yes, ink = live, grey = in work. Prefer Badge for new work. */
function Pill({
  tone = "soft",
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nh-ui-pill",
    "data-tone": tone
  }, children);
}
/** The tone the app picks for a status word. */
const statusTone = s => StatusTone(s);
function StatusTone(s) {
  if (s === "Awaiting decision" || s === "Sent" || s === "Question for you" || s === "Waiting for an answer") return "accent";
  if (s === "Shipped" || s === "Live") return "ink";
  if (s === "Approved" || s === "Answered: yes") return "ok";
  if (s === "In trial" || s === "Building" || s === "Being built") return "grey";
  return "ghost";
}
Object.assign(__ds_scope, { Pill, statusTone, StatusTone });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Pill.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Quote.jsx
try { (() => {
/** What someone actually said, with who said it - a 2px rule on the left. */
function Quote({
  text,
  by,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-quote",
    "data-tone": tone
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-quote-text"
  }, text), /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-quote-by"
  }, by));
}
Object.assign(__ds_scope, { Quote });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Quote.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Steps.jsx
try { (() => {
/** The four steps of anything sent: a thin bar each - ink when done, blue for now, red when late. */
function Steps({
  steps
}) {
  return /*#__PURE__*/React.createElement("ol", {
    className: "nh-ui-steps",
    "aria-label": "Progress"
  }, steps.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.label,
    className: "nh-ui-step",
    "data-tone": s.tone
  }, /*#__PURE__*/React.createElement("span", {
    className: "nh-ui-step-bar"
  }), /*#__PURE__*/React.createElement("span", {
    className: "nh-ui-step-label"
  }, s.label), /*#__PURE__*/React.createElement("span", {
    className: "nh-ui-step-when"
  }, s.when))));
}
Object.assign(__ds_scope, { Steps });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Steps.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Tile.jsx
try { (() => {
/** A stat inside a card: hairline above, no box - a card never holds another box. */
function Tile({
  v,
  l,
  hot,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-tile",
    "data-click": onClick ? "true" : undefined,
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-tile-v",
    "data-hot": hot ? "true" : undefined
  }, v), /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-tile-l"
  }, l));
}
/** A row of numbers: one box, hairlines between - not one card per number. */
function Stats({
  items
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-stats"
  }, items.map(k => /*#__PURE__*/React.createElement("div", {
    key: k.l,
    className: "nh-ui-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-stat-v",
    "data-hot": k.hot ? "true" : undefined
  }, k.v), /*#__PURE__*/React.createElement("div", {
    className: "nh-ui-stat-l"
  }, k.l))));
}
Object.assign(__ds_scope, { Tile, Stats });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Tile.jsx", error: String((e && e.message) || e) }); }

// components/icons/Icon.jsx
try { (() => {
/** The product's 24×24 stroke paths (components/ideas/raiseIcons.tsx), round caps and joins. */
const IconPaths = {
  idea: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z",
  receiver: "M6.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M17 8.5l2 2 3.5-3.5",
  colleague: "M6.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M19 7v6M16 10h6",
  meeting: "M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-10A2.5 2.5 0 0 1 6 5zM3.5 10h17M8 3v4M16 3v4",
  file: "M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5",
  affected: "M6 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 19c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3 4.6",
  vis: "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  globe: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  down: "M6 9l6 6 6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
  pencil: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z",
  sidebar: "M9.5 4.5v15",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  sparkle: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
  /* from the shell and list tools */
  mic: "M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
  search: "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M20 20l-3.5-3.5",
  sort: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",
  filter: "M3 5h18M6 12h12M10 19h4",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM9.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  comment: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"
};
/** One <svg> for any product icon. `solid` fills (only bolt and sparkle are drawn filled in the product). */
function Icon({
  name,
  size = 16,
  color = "currentColor",
  width = 1.9,
  solid,
  style
}) {
  const d = IconPaths[name];
  if (solid) return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    style: style
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: color
  }));
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    style: style
  }, name === "sidebar" && /*#__PURE__*/React.createElement("rect", {
    x: "3.5",
    y: "4.5",
    width: "17",
    height: "15",
    rx: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: d
  }));
}
Object.assign(__ds_scope, { IconPaths, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icons/Icon.jsx", error: String((e && e.message) || e) }); }

// components/ideas/RaiseComposer.jsx
try { (() => {
const PRESETS = ["Impact", "Who\u2019s blocked", "Already tried", "Trial", "Deadline"];
/** The gold-ringed composer: actions bolt, a growing field, dictation and send; chips and a prompt tray under it. */
function RaiseComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Share an idea that would make work better\u2026",
  chips = [],
  tray = true,
  onPreset
}) {
  const [v, setV] = React.useState("");
  const val = value ?? v,
    set = onChange ?? setV;
  const ready = val.trim().length >= 3;
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-composer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-aura"
  }), /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-ring"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-row"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-composer-kind",
    "aria-label": "Actions"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "bolt",
    size: 10.5,
    color: "#1c1c1e",
    solid: true
  })), /*#__PURE__*/React.createElement("textarea", {
    className: "nh-composer-field",
    rows: 1,
    value: val,
    placeholder: placeholder,
    "aria-label": placeholder,
    onChange: e => set(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (ready && onSubmit) onSubmit(val);
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-composer-dictate",
    "aria-label": "Dictate"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "mic",
    size: 13.5,
    width: 2
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-composer-send",
    "data-ready": ready,
    disabled: !ready,
    "aria-label": "Send",
    onClick: () => onSubmit && onSubmit(val)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "up",
    size: 11.25,
    color: "#fff",
    width: 2.6
  }))), chips.length ? /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-strip"
  }, chips.map(c => /*#__PURE__*/React.createElement("span", {
    key: c.title,
    className: "nh-composer-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nh-composer-lead",
    "data-kind": c.kind,
    "data-avatar": c.tone
  }, c.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: c.icon,
    size: 12
  }) : __ds_scope.Initials(c.title)), /*#__PURE__*/React.createElement("span", {
    className: "nh-composer-chiptext"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nh-composer-chiptitle"
  }, c.title), /*#__PURE__*/React.createElement("span", {
    className: "nh-composer-chipsub"
  }, c.sub))))) : /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-spacer"
  }))), tray && /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-tray"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-trayrow"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-composer-traybtn",
    "data-custom": "",
    onClick: () => onPreset && onPreset("")
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "plus",
    size: 7.5,
    width: 3
  }), "Custom"), PRESETS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    type: "button",
    className: "nh-composer-traybtn",
    onClick: () => onPreset && onPreset(p)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "plus",
    size: 7.5,
    width: 3
  }), p)))));
}
Object.assign(__ds_scope, { RaiseComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ideas/RaiseComposer.jsx", error: String((e && e.message) || e) }); }

// components/shell/Ground.jsx
try { (() => {
/** The surface under every page: four soft blue blobs drifting under a grain, plus a faint dot grid. */
function Ground({
  contained,
  dots = 0.2,
  spacing = 42
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nh-ground",
    "data-contained": contained ? "true" : undefined,
    "aria-hidden": "true",
    style: {
      "--dots-strength": dots,
      "--dot-spacing": spacing + "px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b1"
  }), /*#__PURE__*/React.createElement("span", {
    className: "b2"
  }), /*#__PURE__*/React.createElement("span", {
    className: "b3"
  }), /*#__PURE__*/React.createElement("span", {
    className: "b4"
  }), /*#__PURE__*/React.createElement("span", {
    className: "grain"
  }), /*#__PURE__*/React.createElement("span", {
    className: "dots"
  }));
}
Object.assign(__ds_scope, { Ground });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Ground.jsx", error: String((e && e.message) || e) }); }

// components/shell/NavPill.jsx
try { (() => {
/** The segmented place switcher: an ink thumb slides under the current place; counts in a grey capsule. */
function NavPill({
  items,
  value,
  onChange
}) {
  const ref = React.useRef(null);
  const [thumb, setThumb] = React.useState(null);
  React.useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const m = () => {
      const on = nav.querySelector('[data-active="true"]');
      setThumb(on ? {
        x: on.offsetLeft,
        w: on.offsetWidth
      } : null);
    };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [value, items.length]);
  return /*#__PURE__*/React.createElement("nav", {
    ref: ref,
    className: "nh-nav",
    "aria-label": "Main"
  }, thumb && /*#__PURE__*/React.createElement("span", {
    className: "nh-nav-thumb",
    style: {
      transform: "translateX(" + thumb.x + "px)",
      width: thumb.w
    },
    "aria-hidden": "true"
  }), items.map(n => {
    const key = n.key ?? n.label,
      on = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      type: "button",
      className: "nh-nav-item",
      "data-active": on ? "true" : undefined,
      "aria-current": on ? "page" : undefined,
      onClick: () => onChange && onChange(key)
    }, n.label, n.count > 0 && /*#__PURE__*/React.createElement("span", {
      className: "nh-nav-count"
    }, n.count));
  }));
}
Object.assign(__ds_scope, { NavPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/NavPill.jsx", error: String((e && e.message) || e) }); }

// components/shell/Toggle.jsx
try { (() => {
/** The handoff screens' pill controls: dark toggles (Sort, Support), white filter chips with counts. */
function Toggle({
  tone = "dark",
  size,
  icon,
  count,
  onClick,
  children,
  ariaLabel
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-toggle",
    "data-tone": tone,
    "data-size": size,
    "data-icon": !children ? "true" : undefined,
    onClick: onClick,
    "aria-label": ariaLabel
  }, icon, children, count != null && /*#__PURE__*/React.createElement("span", {
    className: "nh-toggle-count"
  }, count));
}
function FilterChip({
  on,
  count,
  onClick,
  children
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-filter",
    "data-on": on ? "true" : undefined,
    "aria-pressed": !!on,
    onClick: onClick
  }, children, count != null && /*#__PURE__*/React.createElement("span", {
    className: "nh-filter-count"
  }, count));
}
Object.assign(__ds_scope, { Toggle, FilterChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/shell/Wordmark.jsx
try { (() => {
const RATIO = {
  horizontal: 494 / 212,
  stacked: 279 / 301,
  mark: 158 / 136
};
/** The NextUp logo - the real files in assets/brand, never redrawn. Default: horizontal, blue mark + black name (the app bar). */
function Wordmark({
  base = "assets/brand/",
  layout = "horizontal",
  tone = "blue",
  height = 28,
  style
}) {
  const src = base + "nextup-" + layout + "-" + tone + ".png";
  return /*#__PURE__*/React.createElement("img", {
    className: "nh-wordmark",
    src: src,
    alt: "NextUp",
    height: height,
    style: {
      height,
      width: Math.round(height * RATIO[layout]),
      ...style
    }
  });
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/shell/ShellBar.jsx
try { (() => {
/** The app's one bar: wordmark left, search + places centre, the "me" button right. Frosted white. */
function ShellBar({
  logoBase,
  items,
  value,
  onChange,
  me = "JS",
  onMe,
  onLogo,
  search = true
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "nh-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nh-bar-brand",
    onClick: onLogo
  }, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    base: logoBase,
    height: 28
  })), /*#__PURE__*/React.createElement("div", {
    className: "nh-bar-center"
  }, search && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-bar-search",
    "aria-label": "Search"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 14,
    color: "#8e8e93",
    width: 2.4
  })), /*#__PURE__*/React.createElement(__ds_scope.NavPill, {
    items: items,
    value: value,
    onChange: onChange
  })), /*#__PURE__*/React.createElement("div", {
    className: "nh-bar-right"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nh-me",
    onClick: onMe,
    "aria-label": "Profile"
  }, me)));
}
Object.assign(__ds_scope, { ShellBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/ShellBar.jsx", error: String((e && e.message) || e) }); }

// components/system/Badge.jsx
try { (() => {
/** Tinted status badge: blue = time left, grey = late/paused, amber = under review / needs info, green = approved. */
function Badge({
  tone,
  size,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "nu-badge",
    "data-tone": tone,
    "data-size": size
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/Badge.jsx", error: String((e && e.message) || e) }); }

// components/system/ChatMessage.jsx
try { (() => {
/** One chat line. user = black bubble right; ai = plain text left; them = a named person's grey bubble with avatar. */
function ChatMessage({
  role = "ai",
  text,
  initials,
  tone,
  when
}) {
  if (role === "them") return /*#__PURE__*/React.createElement("div", {
    className: "nu-msg",
    "data-role": "them"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-av",
    "data-avatar": tone,
    style: {
      width: 28,
      height: 28,
      fontSize: 12
    }
  }, initials), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "nu-bubble"
  }, text), when && /*#__PURE__*/React.createElement("span", {
    className: "nu-msg-when"
  }, when)));
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-msg",
    "data-role": role
  }, /*#__PURE__*/React.createElement("p", {
    className: "nu-bubble"
  }, text));
}
/** The vertical turn rail beside the coach chat. */
function ProgressRail({
  count,
  current,
  onPick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-rail"
  }, Array.from({
    length: count
  }, (_, i) => {
    const s = i + 1 === current ? "now" : i + 1 < current ? "done" : "todo";
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "nu-rail-dot",
      "data-s": s,
      onClick: () => onPick && onPick(i + 1),
      "aria-label": "Turn " + (i + 1)
    }, s === "now" ? current : s === "done" ? /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "8",
      viewBox: "0 0 24 24"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M5 12.5l4.5 4.5L19 7.5",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "3.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })) : null);
  }));
}
Object.assign(__ds_scope, { ChatMessage, ProgressRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/ChatMessage.jsx", error: String((e && e.message) || e) }); }

// components/system/DecisionList.jsx
try { (() => {
/** "Your decision": one row per way to answer. The picked one goes black; the AI's advice wears a sparkle tag. */
function DecisionList({
  title = "Your decision",
  options,
  value,
  suggested,
  onPick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-card",
    "data-pad": "sm"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "nu-card-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "nu-actions"
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o,
    type: "button",
    className: "nu-action",
    "data-primary": value === o ? "true" : undefined,
    onClick: () => onPick && onPick(o)
  }, o, suggested === o && /*#__PURE__*/React.createElement("span", {
    className: "nu-suggest"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round"
  })), "AI suggests")))));
}
Object.assign(__ds_scope, { DecisionList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/DecisionList.jsx", error: String((e && e.message) || e) }); }

// components/system/FeedPanel.jsx
try { (() => {
/** "From the feed": supporters + comments boxes, a one-line read, and the comment box. */
function FeedPanel({
  supporters = 0,
  comments = 0,
  line,
  onPost
}) {
  const [draft, setDraft] = React.useState("");
  const post = () => {
    if (!draft.trim()) return;
    onPost && onPost(draft.trim());
    setDraft("");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-card",
    "data-pad": "sm"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "nu-card-title"
  }, "From the feed"), /*#__PURE__*/React.createElement("div", {
    className: "nu-stat-boxes"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nu-stat-box"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-stat-num"
  }, supporters), /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, "supporters")), /*#__PURE__*/React.createElement("div", {
    className: "nu-stat-box"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-stat-num"
  }, comments), /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, "comments"))), line && /*#__PURE__*/React.createElement("p", {
    className: "nu-para",
    style: {
      fontSize: 13
    }
  }, line), comments === 0 && /*#__PURE__*/React.createElement("p", {
    className: "nu-label"
  }, "No comments yet."), /*#__PURE__*/React.createElement("div", {
    className: "nu-compose"
  }, /*#__PURE__*/React.createElement("input", {
    className: "nu-input",
    placeholder: "Add a comment",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") post();
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nu-post",
    "data-live": draft.trim() ? "true" : undefined,
    onClick: post
  }, "Post")));
}
Object.assign(__ds_scope, { FeedPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/FeedPanel.jsx", error: String((e && e.message) || e) }); }

// components/system/IconButton.jsx
try { (() => {
/** Round icon-only button: dark close (×), grey fill, ghost, or outlined square for the composer add-ons. */
function IconButton({
  variant = "fill",
  size,
  label,
  onClick,
  children
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nu-icon-btn",
    "data-variant": variant,
    "data-size": size,
    "aria-label": label,
    title: label,
    onClick: onClick
  }, children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/system/InfoPanel.jsx
try { (() => {
/** The grey label / value grid inside a card (Who, Worth, Owner on the map …). */
function InfoPanel({
  rows
}) {
  return /*#__PURE__*/React.createElement("dl", {
    className: "nu-panel"
  }, rows.map(r => /*#__PURE__*/React.createElement(React.Fragment, {
    key: r.label
  }, /*#__PURE__*/React.createElement("dt", null, r.label), /*#__PURE__*/React.createElement("dd", null, r.value, r.sub && /*#__PURE__*/React.createElement("span", {
    className: "nu-panel-sub"
  }, r.sub)))));
}
/** Labelled horizontal bars in the same grey panel (What the AI found). */
function BarsPanel({
  title,
  rows,
  note
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-bars"
  }, title && /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, title), rows.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.label,
    className: "nu-bar-row"
  }, /*#__PURE__*/React.createElement("span", null, r.label), /*#__PURE__*/React.createElement("span", {
    className: "nu-track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-fill",
    style: {
      width: Math.round(r.value * 100) + "%"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "nu-bar-val"
  }, r.display))), note && /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, note));
}
Object.assign(__ds_scope, { InfoPanel, BarsPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/InfoPanel.jsx", error: String((e && e.message) || e) }); }

// components/system/PillButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The new system's button: a pill. dark = the action, fill = the alternatives, light = on the Ground, outline = done. */
function PillButton({
  variant = "dark",
  size,
  block,
  icon,
  count,
  href,
  onClick,
  disabled,
  children,
  style
}) {
  const p = {
    className: "nu-btn",
    "data-variant": variant,
    "data-size": size,
    "data-block": block ? "true" : undefined,
    style
  };
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, icon, children, count != null && /*#__PURE__*/React.createElement("span", {
    className: "nu-btn-count"
  }, count));
  if (href) return /*#__PURE__*/React.createElement("a", _extends({
    href: href
  }, p), inner);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    disabled: disabled
  }, p), inner);
}
Object.assign(__ds_scope, { PillButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/PillButton.jsx", error: String((e && e.message) || e) }); }

// components/system/ScoreGauge.jsx
try { (() => {
/** One score tile: label, a 270° blue arc out of 100, and the black chevron that opens its reasoning. */
function ScoreGauge({
  label,
  value,
  open,
  onToggle
}) {
  const fill = (value / 100 * 141.4).toFixed(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-score",
    "data-open": open ? "true" : undefined
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-score-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "nu-gauge"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 72 72",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "36",
    r: "30",
    className: "t",
    strokeDasharray: "141.4 188.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "36",
    r: "30",
    className: "f",
    strokeDasharray: fill + " 188.5"
  })), /*#__PURE__*/React.createElement("div", {
    className: "nu-gauge-text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-gauge-num"
  }, value), /*#__PURE__*/React.createElement("span", {
    className: "nu-gauge-sub"
  }, "/ 100")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "nu-gauge-btn",
    "aria-label": "Why " + label,
    onClick: onToggle
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6"
  })))));
}
/** The row of five. */
function ScoreRow({
  scores,
  open,
  onToggle
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-scores"
  }, scores.map(s => /*#__PURE__*/React.createElement(ScoreGauge, {
    key: s.label,
    label: s.label,
    value: s.value,
    open: open === s.label,
    onToggle: () => onToggle && onToggle(s.label)
  })));
}
Object.assign(__ds_scope, { ScoreGauge, ScoreRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/ScoreGauge.jsx", error: String((e && e.message) || e) }); }

// components/system/Segmented.jsx
try { (() => {
/** Two-to-four tabs in one track. grey = white thumb (Idea / AI); white = black thumb (Open / Archive). */
function Segmented({
  items,
  value,
  onChange,
  tone = "grey"
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-seg",
    "data-tone": tone,
    role: "tablist"
  }, items.map(it => {
    const key = it.key ?? it.label,
      on = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      type: "button",
      role: "tab",
      "aria-selected": on,
      className: "nu-seg-item",
      "data-on": on ? "true" : undefined,
      onClick: () => onChange && onChange(key)
    }, it.icon, it.label, it.count != null && /*#__PURE__*/React.createElement("span", {
      className: "nu-seg-count"
    }, it.count));
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/system/StepTrack.jsx
try { (() => {
/** Where an idea is: five thin bars - ink when done, blue for now, grey still to come. */
function StepTrack({
  steps
}) {
  return /*#__PURE__*/React.createElement("ol", {
    className: "nu-steps",
    "aria-label": "Progress"
  }, steps.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.label,
    className: "nu-step",
    "data-tone": s.tone
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-step-bar"
  }), /*#__PURE__*/React.createElement("span", {
    className: "nu-step-text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-step-label"
  }, s.label), /*#__PURE__*/React.createElement("span", {
    className: "nu-step-sub"
  }, s.sub)))));
}
/** The strip under it: whose desk it is on and how much of the promise is used. */
function DeskStrip({
  name,
  role,
  initials,
  tone,
  used = 0,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "nu-desk"
  }, /*#__PURE__*/React.createElement("span", null, "On the desk of"), /*#__PURE__*/React.createElement("span", {
    className: "nu-desk-who"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-av",
    "data-avatar": tone,
    style: {
      width: 24,
      height: 24,
      fontSize: 12
    }
  }, initials), name, " ", /*#__PURE__*/React.createElement("span", {
    className: "nu-desk-role"
  }, role)), /*#__PURE__*/React.createElement("span", {
    className: "nu-desk-clock"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-desk-track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-desk-fill",
    "data-late": used > 1 ? "true" : undefined,
    style: {
      width: Math.min(1, used) * 100 + "%"
    }
  })), label));
}
Object.assign(__ds_scope, { StepTrack, DeskStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/system/StepTrack.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/App.jsx
try { (() => {
// The signed-in app: ShellBar + profile popover + toast; places switch the screen.
function App() {
  const {
    ShellBar,
    Ground
  } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [place, setPlace] = React.useState(() => {
    const p = localStorage.getItem("nextup-kit-place");
    return ["login", "Ideas", "Inbox", "Feed", "Sent", "Projects"].includes(p) ? p : "login";
  });
  const [pop, setPop] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    localStorage.setItem("nextup-kit-place", place);
  }, [place]);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const go = p => {
    setPlace(p);
    setPop(false);
  };
  if (place === "login") return /*#__PURE__*/React.createElement(LoginScreen, {
    onLogin: () => go("Ideas")
  });
  const items = [{
    label: "Ideas"
  }, {
    label: "Inbox",
    count: 7
  }, {
    label: "Feed"
  }, {
    label: "Projects"
  }];
  const screen = {
    Ideas: /*#__PURE__*/React.createElement(RaiseScreen, {
      toast: setToast
    }),
    Inbox: /*#__PURE__*/React.createElement(InboxScreen, {
      toast: setToast
    }),
    Feed: /*#__PURE__*/React.createElement(FeedScreen, {
      onOpen: () => go("Projects")
    }),
    Projects: /*#__PURE__*/React.createElement(ProjectScreen, {
      toast: setToast
    }),
    Sent: /*#__PURE__*/React.createElement(SentScreen, {
      toast: setToast
    })
  }[place];
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-root nu"
  }, /*#__PURE__*/React.createElement(Ground, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement(ShellBar, {
    logoBase: "../../assets/brand/",
    items: items,
    value: place,
    onChange: go,
    me: D.me.ini,
    onMe: () => setPop(p => !p),
    onLogo: () => go("Ideas")
  }), pop && /*#__PURE__*/React.createElement("div", {
    className: "kit-me",
    style: {
      right: 16,
      top: 52,
      position: "absolute"
    },
    role: "dialog",
    "aria-label": "Profile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-me-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-me-av"
  }, D.me.ini), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "kit-me-name"
  }, D.me.name), /*#__PURE__*/React.createElement("span", {
    className: "kit-me-line"
  }, D.me.line))), /*#__PURE__*/React.createElement("div", {
    className: "kit-me-stats"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Team leader")), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "7"), " in inbox"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "14"), " decided")), /*#__PURE__*/React.createElement("div", {
    className: "kit-me-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "kit-me-link",
    onClick: () => go("Ideas")
  }, "My profile ", /*#__PURE__*/React.createElement("span", null, "\u2192")), /*#__PURE__*/React.createElement("button", {
    className: "kit-me-link",
    onClick: () => go("Sent")
  }, "What I sent ", /*#__PURE__*/React.createElement("span", null, "\u2192")), /*#__PURE__*/React.createElement("button", {
    className: "kit-logout",
    onClick: () => go("login")
  }, "Log out")))), /*#__PURE__*/React.createElement("main", {
    className: "kit-content",
    "data-wide": place === "Inbox" || place === "Projects" ? "true" : undefined,
    "data-full": place === "Ideas" ? "true" : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-inner"
  }, screen)), toast && /*#__PURE__*/React.createElement("div", {
    className: "nh-toast",
    role: "status"
  }, toast));
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/FeedScreen.jsx
try { (() => {
// Feed - dashboard/team/FeedView: Open/Archive, site + sort, department chips, cover cards with Support.
function FeedScreen({
  onOpen
}) {
  const {
    PillButton,
    FilterChip,
    Segmented,
    Badge,
    Icon,
    Initials
  } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [dept, setDept] = React.useState("All");
  const [view, setView] = React.useState("open");
  const [sup, setSup] = React.useState({});
  const depts = ["All", "Production", "Engineering", "Quality", "Finance", "Ops & Admin", "HR / IT", "Field Service", "Sales"];
  const list = D.feed.filter(f => (view === "open" ? !f.archived : f.archived) && (dept === "All" || f.tags.includes(dept)));
  const n = d => D.feed.filter(f => !f.archived && (d === "All" || f.tags.includes(d))).length;
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-feed",
    "data-screen-label": "Feed"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-feed-head"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "nu-page-title"
  }, "Feed"), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap"
  }, /*#__PURE__*/React.createElement(PillButton, {
    variant: "light",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "pin",
      size: 14,
      width: 2.2
    })
  }, "All sites"), /*#__PURE__*/React.createElement(PillButton, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "sort",
      size: 14,
      width: 2.2
    })
  }, "Most supported"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Segmented, {
    tone: "white",
    value: view,
    onChange: setView,
    items: [{
      label: "Open",
      key: "open",
      count: D.feed.filter(f => !f.archived).length
    }, {
      label: "Archive",
      key: "archive",
      count: D.feed.filter(f => f.archived).length
    }]
  })), /*#__PURE__*/React.createElement("div", {
    className: "kit-chips"
  }, depts.map(d => /*#__PURE__*/React.createElement(FilterChip, {
    key: d,
    on: dept === d,
    count: n(d),
    onClick: () => setDept(d)
  }, d))), /*#__PURE__*/React.createElement("div", {
    className: "kit-grid"
  }, list.map(f => {
    const on = !!sup[f.id];
    return /*#__PURE__*/React.createElement("div", {
      key: f.id,
      className: "kit-fcard",
      onClick: () => onOpen && onOpen(f.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: "kit-cover"
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/feed/library/" + f.img + ".webp",
      alt: ""
    }), /*#__PURE__*/React.createElement("div", {
      className: "kit-scrim"
    }), /*#__PURE__*/React.createElement("div", {
      className: "kit-cover-top"
    }, /*#__PURE__*/React.createElement("span", {
      className: "kit-ini"
    }, Initials(f.from)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "kit-author"
    }, f.from), /*#__PURE__*/React.createElement("span", {
      className: "kit-dept"
    }, f.dept)), /*#__PURE__*/React.createElement(Badge, {
      tone: f.tone,
      size: "md"
    }, f.stage)), /*#__PURE__*/React.createElement("div", {
      className: "kit-cover-bottom"
    }, /*#__PURE__*/React.createElement("span", {
      className: "kit-cover-stat"
    }, f.stat), /*#__PURE__*/React.createElement("span", {
      className: "kit-cover-hook"
    }, f.hook))), /*#__PURE__*/React.createElement("h3", {
      className: "kit-ftitle"
    }, f.title), /*#__PURE__*/React.createElement("div", {
      className: "kit-ffoot",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement(PillButton, {
      size: "sm",
      variant: on ? "outline" : "dark",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: on ? "check" : "up",
        size: 13,
        width: 2.6
      }),
      count: f.support + (on ? 1 : 0),
      onClick: () => setSup(s => ({
        ...s,
        [f.id]: !s[f.id]
      }))
    }, on ? "Supported" : "Support"), /*#__PURE__*/React.createElement("span", {
      className: "kit-comments"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "comment",
      size: 14,
      width: 2.2
    }), f.comments), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        color: "#c7c7cc",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "right",
      size: 14,
      width: 2.2
    }))));
  })));
}
window.FeedScreen = FeedScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/FeedScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/InboxScreen.jsx
try { (() => {
// Inbox - leader/InboxView + IdeaDetail: the list card; opened, an avatar rail, the idea, five scores, Your decision, From the feed.
function InboxScreen({
  toast
}) {
  const {
    Stats,
    Avatar,
    PillButton,
    IconButton,
    Icon,
    Badge,
    InfoPanel,
    ScoreRow,
    DecisionList,
    FeedPanel,
    AvatarTone,
    Initials
  } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [rows, setRows] = React.useState(D.inbox);
  const [open, setOpen] = React.useState(null);
  const [pick, setPick] = React.useState(null);
  const [score, setScore] = React.useState(null);
  const cur = rows.find(r => r.id === open);
  const decide = o => {
    setPick(o);
    if (o === "Discuss first") {
      toast("Discussion started · " + cur.from + " and the people affected are invited.");
      return;
    }
    setRows(rs => rs.filter(r => r.id !== open));
    setOpen(null);
    setPick(null);
    toast(o.replace(/, do it|, and why/, "") + " · " + cur.from + " has been told.");
  };
  if (cur) return /*#__PURE__*/React.createElement("div", {
    className: "kit-detail",
    "data-screen-label": "Inbox \xB7 idea"
  }, /*#__PURE__*/React.createElement("nav", {
    className: "kit-rail",
    "aria-label": "Inbox"
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "ghost",
    label: "Back to the list",
    onClick: () => setOpen(null)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sidebar",
    size: 16
  })), rows.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    className: "kit-rail-item",
    "data-active": r.id === open ? "true" : undefined,
    onClick: () => {
      setOpen(r.id);
      setPick(null);
    },
    title: r.title
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-av",
    "data-avatar": AvatarTone(r.from),
    style: {
      width: 32,
      height: 32,
      fontSize: 12
    }
  }, Initials(r.from))))), /*#__PURE__*/React.createElement("div", {
    className: "kit-detail-main"
  }, /*#__PURE__*/React.createElement("article", {
    className: "nu-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-av",
    "data-avatar": AvatarTone(cur.from),
    style: {
      width: 36,
      height: 36,
      fontSize: 13
    }
  }, Initials(cur.from)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, cur.from), /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, cur.role, " \xB7 raised on ", cur.raised)), /*#__PURE__*/React.createElement(Badge, {
    tone: cur.tone,
    size: "md"
  }, cur.badge), /*#__PURE__*/React.createElement(IconButton, {
    variant: "dark",
    label: "Close",
    onClick: () => setOpen(null)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 12,
    width: 2.6
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "nu-title"
  }, cur.title), /*#__PURE__*/React.createElement("p", {
    className: "nu-lede"
  }, cur.solves), /*#__PURE__*/React.createElement("div", {
    className: "nu-section"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, "Affects"), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      gap: 6
    }
  }, cur.affects.map(a => /*#__PURE__*/React.createElement("span", {
    key: a,
    className: "nu-chip"
  }, a)))), /*#__PURE__*/React.createElement(InfoPanel, {
    rows: cur.facts.map(([label, value]) => ({
      label,
      value
    }))
  })), /*#__PURE__*/React.createElement(ScoreRow, {
    scores: cur.scores,
    open: score,
    onToggle: l => setScore(score === l ? null : l)
  }), score && /*#__PURE__*/React.createElement("article", {
    className: "nu-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, score), /*#__PURE__*/React.createElement("p", {
    className: "nu-para"
  }, "The AI scores " + score.toLowerCase() + " from what the idea says and what it can check - the numbers, who decides and a first step."))), /*#__PURE__*/React.createElement("aside", {
    className: "kit-detail-side"
  }, /*#__PURE__*/React.createElement(DecisionList, {
    options: ["Yes, do it", "Discuss first", "No, and why", "Pass to Markus Roth", "Ask a question"],
    value: pick,
    suggested: cur.suggest,
    onPick: decide
  }), /*#__PURE__*/React.createElement(FeedPanel, {
    supporters: cur.supporters,
    comments: 0,
    line: cur.supporters ? "Positive. Line 2 wants the same." : "Nobody else has added their name yet.",
    onPost: () => toast("Comment posted.")
  })));
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-inbox",
    "data-screen-label": "Inbox"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-inbox-top"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "nu-page-title"
  }, "Fresh ideas"), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "filter",
      size: 14,
      width: 2.2
    })
  }, "Filter"), /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "sort",
      size: 14,
      width: 2.2
    })
  }, "Oldest first"))), /*#__PURE__*/React.createElement("section", {
    className: "kit-inbox-card"
  }, /*#__PURE__*/React.createElement(Stats, {
    items: D.inboxStats
  }), /*#__PURE__*/React.createElement("ul", {
    className: "kit-list"
  }, rows.map(r => /*#__PURE__*/React.createElement("li", {
    key: r.id
  }, /*#__PURE__*/React.createElement("button", {
    className: "kit-row",
    onClick: () => {
      setOpen(r.id);
      setPick(null);
      setScore(null);
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: r.from,
    size: "xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-row-main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-row-title"
  }, r.title), /*#__PURE__*/React.createElement("span", {
    className: "kit-row-who"
  }, r.from, " ", /*#__PURE__*/React.createElement("span", {
    className: "kit-row-role"
  }, "\xB7 ", r.role)), /*#__PURE__*/React.createElement("span", {
    className: "kit-row-solves"
  }, r.solves)), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-row-sent"
  }, r.sent), /*#__PURE__*/React.createElement(Badge, {
    tone: r.tone
  }, r.badge))))))), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "kit-empty-line"
  }, "Nothing waiting on you.")));
}
window.InboxScreen = InboxScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/InboxScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/LoginScreen.jsx
try { (() => {
// Login - AuthShell art="hand" + FindCompanyForm (apps/app/src/app/(auth)/login/page.tsx).
function LoginScreen({
  onLogin
}) {
  const {
    Ground,
    Field,
    Input,
    Divider,
    Button
  } = window.NextUpDesignSystem_2debbf;
  const [email, setEmail] = React.useState("");
  const [err, setErr] = React.useState(null);
  const go = () => {
    if (!email.trim()) {
      setErr("Enter your work email or your company's NextUp name.");
      return;
    }
    onLogin();
  };
  const roles = [["Team member", "Ideas", "Develop an idea with the coach - at the threshold NextUp names the owner and the deadline."], ["Team leader", "Inbox", "Open items, oldest first. Yes, no and why, pass on, or ask - one click."], ["Manager", "Dashboard", "How fast ideas are decided, where the waiting goes, and whether shipped work paid off."]];
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-login",
    "data-screen-label": "Login"
  }, /*#__PURE__*/React.createElement(Ground, null), /*#__PURE__*/React.createElement("a", {
    className: "kit-login-logo"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brand/nextup-horizontal-blue.png",
    alt: "NextUp"
  })), /*#__PURE__*/React.createElement("section", {
    className: "kit-auth"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "kit-art"
  }, /*#__PURE__*/React.createElement("img", {
    className: "kit-hand",
    src: "../../assets/brand/login-hand.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "kit-art-body"
  }, /*#__PURE__*/React.createElement("h2", null, "Nineteen working days.", /*#__PURE__*/React.createElement("br", null), "Three of them are work."), /*#__PURE__*/React.createElement("p", null, "Log in to see what is waiting on whom - and for how long. One home screen per role:"), /*#__PURE__*/React.createElement("ul", {
    className: "kit-roles"
  }, roles.map(([w, s, l]) => /*#__PURE__*/React.createElement("li", {
    key: w
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, w), /*#__PURE__*/React.createElement("strong", null, s), /*#__PURE__*/React.createElement("small", null, l)))))), /*#__PURE__*/React.createElement("main", {
    className: "kit-auth-main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-back"
  }, "\u2190 Back"), /*#__PURE__*/React.createElement("div", {
    className: "kit-auth-card"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "kit-auth-title"
  }, "Find your company"), /*#__PURE__*/React.createElement("p", {
    className: "kit-auth-sub"
  }, "Enter your work email or your company's NextUp name. We will take you to your company's login."), /*#__PURE__*/React.createElement("div", {
    className: "kit-form"
  }, /*#__PURE__*/React.createElement(Field, {
    id: "email",
    label: "Work email",
    error: err
  }, /*#__PURE__*/React.createElement(Input, {
    id: "email",
    type: "email",
    placeholder: "you@company.com",
    value: email,
    onChange: v => {
      setEmail(v);
      setErr(null);
    },
    invalid: !!err
  })), /*#__PURE__*/React.createElement(Divider, null), /*#__PURE__*/React.createElement(Field, {
    id: "company",
    label: "Company name",
    hint: "The short name in your invitation link."
  }, /*#__PURE__*/React.createElement(Input, {
    id: "company",
    placeholder: "your-company",
    suffix: ".nextup.app"
  })), /*#__PURE__*/React.createElement(Button, {
    block: true,
    onClick: go
  }, "Continue")), /*#__PURE__*/React.createElement("div", {
    className: "kit-demo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-demo-head"
  }, /*#__PURE__*/React.createElement("strong", null, "View the demo as\u2026"), /*#__PURE__*/React.createElement("span", {
    className: "kit-demo-tag"
  }, "Demo")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    block: true,
    onClick: onLogin
  }, "J. Schmidt \xB7 Team member")), /*#__PURE__*/React.createElement("p", {
    className: "kit-foot"
  }, "New here? ", /*#__PURE__*/React.createElement("a", null, "Create a workspace"), " \xB7 ", /*#__PURE__*/React.createElement("a", null, "I have an invite"))))));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ProjectScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Projects - the raiser's view of one idea (team/OverviewIdea + OverviewChats): steps, desk, Idea / AI, the thread with the team lead.
function ProjectScreen({
  toast
}) {
  const {
    StepTrack,
    DeskStrip,
    Segmented,
    InfoPanel,
    BarsPanel,
    ScoreRow,
    IconButton,
    ChatMessage,
    Badge,
    FeedPanel,
    Icon,
    PillButton
  } = window.NextUpDesignSystem_2debbf;
  const P = window.KIT_DATA.project;
  const [tab, setTab] = React.useState("idea");
  const [side, setSide] = React.useState("thread");
  const [msgs, setMsgs] = React.useState(P.thread);
  const [draft, setDraft] = React.useState("");
  const send = () => {
    if (!draft.trim()) return;
    setMsgs(m => [...m, {
      role: "user",
      text: draft.trim()
    }]);
    setDraft("");
    toast("Sent to Thomas Vogel · the clock runs again.");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-detail kit-project",
    "data-screen-label": "Projects \xB7 idea"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-detail-main"
  }, /*#__PURE__*/React.createElement("article", {
    className: "nu-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-label",
    style: {
      flex: 1
    }
  }, P.raised), /*#__PURE__*/React.createElement(IconButton, {
    variant: "dark",
    size: "lg",
    label: "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14,
    width: 2.6
  }))), /*#__PURE__*/React.createElement("h1", {
    className: "nu-title",
    style: {
      fontSize: 24,
      marginTop: -6
    }
  }, P.title), /*#__PURE__*/React.createElement(StepTrack, {
    steps: P.steps
  }), /*#__PURE__*/React.createElement(DeskStrip, P.desk)), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: tab,
    onChange: setTab,
    items: [{
      label: "Idea",
      key: "idea"
    }, {
      label: "AI",
      key: "ai",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 10,
        width: 2.6
      })
    }]
  }), /*#__PURE__*/React.createElement(IconButton, {
    variant: "fill",
    label: "Edit"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pencil",
    size: 14
  }))), tab === "idea" ? /*#__PURE__*/React.createElement("article", {
    className: "nu-card"
  }, /*#__PURE__*/React.createElement("p", {
    className: "nu-lede",
    style: {
      color: "#1c1c1e"
    }
  }, P.body), /*#__PURE__*/React.createElement("div", {
    className: "nu-section"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, "Who"), /*#__PURE__*/React.createElement(InfoPanel, {
    rows: P.who
  }))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ScoreRow, {
    scores: P.scores
  }), /*#__PURE__*/React.createElement("article", {
    className: "nu-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#007aff",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 13,
    solid: true
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "What the AI found")), /*#__PURE__*/React.createElement("p", {
    className: "nu-lede",
    style: {
      color: "#1c1c1e"
    }
  }, P.found, /*#__PURE__*/React.createElement("span", {
    className: "nu-cite"
  }, "1")), /*#__PURE__*/React.createElement("p", {
    className: "nu-para"
  }, P.foundSub, /*#__PURE__*/React.createElement("span", {
    className: "nu-cite"
  }, "1")), /*#__PURE__*/React.createElement(BarsPanel, {
    title: "Minutes before the first part runs",
    rows: P.bars,
    note: /*#__PURE__*/React.createElement(React.Fragment, null, "Line 4 already works this way.", /*#__PURE__*/React.createElement("span", {
      className: "nu-cite"
    }, "1 2"))
  }), /*#__PURE__*/React.createElement("p", {
    className: "nu-para"
  }, "Advice when it was raised: Approve. Clear, cheap, and the decision is the team lead\u2019s own.", /*#__PURE__*/React.createElement("span", {
    className: "nu-cite"
  }, "3"))))), /*#__PURE__*/React.createElement("aside", {
    className: "kit-detail-side kit-thread-col"
  }, side === "thread" ? /*#__PURE__*/React.createElement("section", {
    className: "nu-card kit-thread-card",
    "data-pad": "none"
  }, /*#__PURE__*/React.createElement("header", {
    className: "kit-thread-head"
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "fill",
    size: "lg",
    label: "Switch",
    onClick: () => setSide("feed")
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "down",
    size: 14,
    width: 2.2
  })), /*#__PURE__*/React.createElement("span", {
    className: "nu-av",
    "data-avatar": "blue",
    style: {
      width: 44,
      height: 44,
      fontSize: 15
    }
  }, "TV"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: "#1b1d22"
    }
  }, "Thomas Vogel"), /*#__PURE__*/React.createElement("span", {
    className: "nu-label"
  }, "Team lead, 4-series"))), /*#__PURE__*/React.createElement("div", {
    className: "kit-thread-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "review",
    size: "md"
  }, "Needs more info")), /*#__PURE__*/React.createElement("div", {
    className: "nu-thread"
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement(ChatMessage, _extends({
    key: i
  }, m))))), /*#__PURE__*/React.createElement("div", {
    className: "kit-thread-compose"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-mini-composer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      alignItems: "flex-start",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "nu-icon-btn",
    "data-variant": "fill",
    "data-size": "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bolt",
    size: 10.5,
    solid: true
  })), /*#__PURE__*/React.createElement("textarea", {
    className: "nh-composer-field",
    rows: 2,
    placeholder: "Answer Thomas Vogel\u2026",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "kit-row-gap",
    style: {
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    variant: "ghost",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "file",
      size: 13
    })
  }, "Attach"), /*#__PURE__*/React.createElement("button", {
    className: "nh-composer-send",
    "data-ready": draft.trim().length > 0,
    onClick: send,
    "aria-label": "Send"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "up",
    size: 11.25,
    color: "#fff",
    width: 2.6
  })))))) : /*#__PURE__*/React.createElement("div", {
    onClick: () => setSide("thread")
  }, /*#__PURE__*/React.createElement(FeedPanel, {
    supporters: 6,
    comments: 0,
    line: "Positive. Line 2 wants the same."
  }))));
}
window.ProjectScreen = ProjectScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ProjectScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/RaiseScreen.jsx
try { (() => {
// Raise - RaiseSidebar + RaiseStart + RaiseComposer, then the coach chat with its turn rail (components/ideas/*).
function RaiseScreen({
  toast
}) {
  const {
    RaiseComposer,
    Icon,
    PillButton,
    ChatMessage,
    ProgressRail,
    IconButton
  } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [turns, setTurns] = React.useState(null);
  const [step, setStep] = React.useState(0);
  const [text, setText] = React.useState("");
  const [cur, setCur] = React.useState(null);
  React.useEffect(() => {
    if (!turns || step >= D.evalSteps.length) return;
    const t = setTimeout(() => setStep(s => s + 1), 480);
    return () => clearTimeout(t);
  }, [turns, step]);
  const start = v => {
    setTurns([{
      role: "user",
      text: v
    }]);
    setStep(0);
    setText("");
    setCur(null);
  };
  const openDraft = i => {
    setCur(i);
    setTurns(D.chat);
    setStep(D.evalSteps.length);
  };
  const done = turns && step >= D.evalSteps.length;
  const open = cur != null ? D.drafts[cur] : null;
  const addOns = [["receiver", "Who decides"], ["colleague", "Add a colleague"], ["meeting", "When to meet"], ["file", "Attach a file"], ["affected", "Who is affected"], ["vis", "Who sees it"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-raise",
    "data-screen-label": "Raise"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "kit-sb"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-sb-top"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kit-sb-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 12,
    color: "#8e8e93",
    width: 2.4
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search"
  })), /*#__PURE__*/React.createElement("button", {
    className: "kit-iconbtn",
    "aria-label": "Hide sidebar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sidebar",
    size: 15
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "kit-draft"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-draft-title"
  }, open.title), /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    variant: "outline",
    block: true,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 12,
      width: 2.6
    })
  }, "Published"), /*#__PURE__*/React.createElement("div", {
    className: "kit-halves"
  }, /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    variant: "fill",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "idea",
      size: 13
    })
  }, "Idea"), /*#__PURE__*/React.createElement(PillButton, {
    size: "sm",
    variant: "fill",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "sparkle",
      size: 10,
      color: "#007aff",
      solid: true
    })
  }, "Analysis")), /*#__PURE__*/React.createElement("div", {
    className: "kit-draft-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-saved"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 11,
    width: 2.2
  }), "Published", /*#__PURE__*/React.createElement("br", null), open.published || "11:55"), /*#__PURE__*/React.createElement("button", {
    className: "kit-discard"
  }, "Remove from list"))), /*#__PURE__*/React.createElement("div", {
    className: "kit-ideas-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-ideas-title"
  }, "Ideas"), /*#__PURE__*/React.createElement("button", {
    className: "kit-new",
    onClick: () => {
      setTurns(null);
      setCur(null);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-plus"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 8,
    color: "#fff",
    width: 3
  })), "New idea")), /*#__PURE__*/React.createElement("div", {
    className: "kit-ideas"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-group"
  }, "Chats & drafts"), D.drafts.map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: d.title,
    className: "kit-idea",
    "aria-current": cur === i ? "true" : undefined,
    onClick: () => openDraft(i)
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-title"
  }, d.title), /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-when"
  }, d.when)), /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-prev"
  }, cur === i ? "Still at 79. I read that, but the four benchmarks…" : d.prev), d.pill && /*#__PURE__*/React.createElement("span", {
    className: "kit-idea-pill"
  }, d.pill))))), /*#__PURE__*/React.createElement("div", {
    className: "kit-sb-foot"
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "outline",
    label: "Report a problem"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bolt",
    size: 13
  })))), /*#__PURE__*/React.createElement("div", {
    className: "kit-main"
  }, !turns ? /*#__PURE__*/React.createElement("div", {
    className: "kit-start"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "kit-h1",
    style: {
      gridRow: 1
    }
  }, "Raise it, ", D.me.name), /*#__PURE__*/React.createElement("div", {
    style: {
      gridRow: 2,
      width: "100%",
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(RaiseComposer, {
    value: text,
    onChange: setText,
    onSubmit: start,
    onPreset: p => setText(t => (t ? t + "\n" : "") + (p ? p + ": " : ""))
  }))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "kit-chat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-thread"
  }, turns.map((t, i) => /*#__PURE__*/React.createElement(ChatMessage, {
    key: i,
    role: t.role,
    text: t.text
  })), !done && /*#__PURE__*/React.createElement("section", {
    className: "kit-eval",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "kit-eval-title"
  }, "Evaluating"), /*#__PURE__*/React.createElement("div", {
    className: "kit-eval-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-eval-step"
  }, D.evalSteps[step]), /*#__PURE__*/React.createElement("span", {
    className: "kit-eval-count"
  }, step + 1, " / ", D.evalSteps.length)), /*#__PURE__*/React.createElement("span", {
    className: "kit-eval-sub"
  }, "Checking it against your org, budget, past ideas and goals"), /*#__PURE__*/React.createElement("div", {
    className: "kit-eval-bars"
  }, D.evalSteps.map((_, k) => /*#__PURE__*/React.createElement("span", {
    key: k,
    className: "kit-eval-bar",
    "data-s": k < step ? "done" : k === step ? "now" : undefined
  })))), done && cur == null && /*#__PURE__*/React.createElement(ChatMessage, {
    text: "This belongs with Thomas Vogel, Team lead 4-series - he owns the shift plan.\n\nI still need this: which company goal does it serve?"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kit-rail-wrap"
  }, /*#__PURE__*/React.createElement(ProgressRail, {
    count: 8,
    current: cur != null ? 5 : 1
  })), /*#__PURE__*/React.createElement("div", {
    className: "kit-dock"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer",
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-ring"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nh-composer-row"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "nh-composer-field",
    rows: 1,
    placeholder: cur != null ? "Add a follow-up — it goes to Overview" : "Answer, or add more detail…",
    value: text,
    onChange: e => setText(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey && text.trim()) {
        e.preventDefault();
        setTurns(ts => [...ts, {
          role: "user",
          text
        }]);
        setText("");
        toast("Scores updated · Impact & reach went up");
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "nh-composer-dictate",
    "aria-label": "Dictate"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "mic",
    size: 13.5,
    width: 2
  })), /*#__PURE__*/React.createElement("button", {
    className: "nh-composer-send",
    "data-ready": text.trim().length > 0,
    "aria-label": "Send"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "up",
    size: 11.25,
    color: "#fff",
    width: 2.6
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kit-addons"
  }, addOns.map(([n, l], i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: n
  }, i === 3 && /*#__PURE__*/React.createElement("span", {
    className: "kit-addon-sep"
  }), /*#__PURE__*/React.createElement(IconButton, {
    variant: "outline",
    label: l
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n,
    size: 14
  }))))))))))));
}
window.RaiseScreen = RaiseScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/RaiseScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/SentScreen.jsx
try { (() => {
// What happened to what I sent - dashboard/team/SentView.
function SentScreen({
  toast
}) {
  const {
    Badge,
    Steps
  } = window.NextUpDesignSystem_2debbf;
  const TONE = {
    accent: "review",
    grey: undefined,
    ink: "dark",
    ok: "approved"
  };
  const D = window.KIT_DATA;
  return /*#__PURE__*/React.createElement("div", {
    className: "kit-sent",
    "data-screen-label": "What I sent"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "kit-sent-title nu-page-title",
    style: {
      fontSize: 28
    }
  }, "What happened to what I sent"), /*#__PURE__*/React.createElement("p", {
    className: "kit-sent-sub"
  }, "2 waiting for an answer \xB7 2 answered \xB7 1 live")), /*#__PURE__*/React.createElement("p", {
    className: "kit-promise"
  }, "Everything you send lands on a named person\u2019s desk. They owe you a yes, a no or a question within 5 days. If they miss that date it moves to their deputy on its own \u2014 nothing you send can get lost."), D.sent.map(m => /*#__PURE__*/React.createElement("article", {
    key: m.title,
    className: "kit-scard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-stop"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "kit-case"
  }, m.title), /*#__PURE__*/React.createElement("p", {
    className: "kit-submitted"
  }, m.submitted)), /*#__PURE__*/React.createElement(Badge, {
    tone: TONE[m.tone],
    size: "md"
  }, m.status)), /*#__PURE__*/React.createElement(Steps, {
    steps: m.steps.map(([label, when, tone]) => ({
      label,
      when,
      tone
    }))
  }), /*#__PURE__*/React.createElement("p", {
    className: "kit-now",
    "data-overdue": m.overdue ? "true" : undefined
  }, m.now), /*#__PURE__*/React.createElement("div", {
    className: "kit-reply"
  }, /*#__PURE__*/React.createElement("p", {
    className: "kit-reply-text"
  }, m.reply), /*#__PURE__*/React.createElement("p", {
    className: "kit-reply-by"
  }, m.replyBy)), m.outcome && /*#__PURE__*/React.createElement("p", {
    className: "kit-outcome"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kit-outcome-l"
  }, m.outcome[0]), /*#__PURE__*/React.createElement("strong", null, m.outcome[1]), /*#__PURE__*/React.createElement("span", {
    className: "kit-outcome-n"
  }, m.outcome[2])), (m.history || m.canReply) && /*#__PURE__*/React.createElement("div", {
    className: "kit-sfoot"
  }, m.canReply && /*#__PURE__*/React.createElement("button", {
    className: "kit-answer",
    onClick: () => toast("Your answer went to " + m.canReply + ".")
  }, "Answer ", m.canReply), m.history && /*#__PURE__*/React.createElement("a", {
    className: "kit-more"
  }, "Full history \u2192")))));
}
window.SentScreen = SentScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/SentScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.js
try { (() => {
// Demo content for the NextUp app kit - names, sentences and numbers in the product's own voice (the acme demo).
window.KIT_DATA = {
  me: {
    name: "J. Schmidt",
    ini: "JS",
    line: "Production, Line 3 · Ulm HQ",
    handle: "Anonymous #4471"
  },
  drafts: [{
    title: "Shift handover notes on a board",
    when: "Thu",
    prev: "Continue the conversation",
    pill: "Draft"
  }, {
    title: "Torque tool calibration log",
    when: "12 Oct",
    prev: "Continue the conversation",
    pill: "Draft"
  }, {
    title: "I have an idea to change the equipment on the production line",
    when: "2 Oct",
    prev: "Follow it in Overview",
    pill: null,
    published: "11:55"
  }, {
    title: "Night shift sign-off for small parts orders",
    when: "29 Sep",
    prev: "Follow it in Overview",
    pill: null
  }, {
    title: "One form for a pallet move, not four",
    when: "28 Sep",
    prev: "Follow it in Overview",
    pill: null
  }],
  chat: [{
    role: "ai",
    text: "I still need this: which company goal does it serve? Pick a suggested answer below and edit it so it is true for your line, or write your own."
  }, {
    role: "user",
    text: "It matters because today we lose time on this every single week, and each time we build the same workaround again instead of fixing it once - the waiting is what people complain about most, and it never gets written down anywhere."
  }, {
    role: "ai",
    text: "Up 23 to 79 - strategic fit got stronger, because the idea now serves “No line stops waiting for a signature” and puts a figure on the goal. That is over the line - it can be published as it is, and every message from here only sharpens it.\n\nImpact & reach is the weakest bar at 55. Add who else it helps (Affected). One person's idea is an opinion; three names next to it are a pattern, and a pattern gets a slot in the next team meeting."
  }],
  evalSteps: ["Reading your idea", "Org chart · who is responsible", "Similar ideas", "Cost and impact", "Feasibility", "Past decisions", "Risks and blockers", "Routing"],
  inboxStats: [{
    v: "8",
    l: "on your desk · 1 paused"
  }, {
    v: "2",
    l: "past the 5-day promise",
    hot: true
  }, {
    v: "2 d",
    l: "median time to answer"
  }, {
    v: "10 / 12",
    l: "within the promise, Q3"
  }],
  inbox: [{
    id: 1,
    from: "Jonas Schmidt",
    role: "Line 3",
    raised: "13 Oct",
    title: "Daylight lamps above the inspection table",
    solves: "The inspection table at the end of line 3 has one yellow ceiling light. Fine scratches only show in daylight, so the customer finds them instead of us.",
    sent: "13 Oct",
    badge: "3 d late",
    tone: "late",
    affects: ["Quality", "Production"],
    facts: [["Worth", "≈ 4 complaints / quarter"], ["Flagged as", "customer sees it"], ["Owner on the map", "You · Workplace and lighting"], ["Open for", "8 days"], ["History", "Past the promise since Friday — Markus Roth sees it too."]],
    scores: [{
      label: "Value",
      value: 70
    }, {
      label: "Fit",
      value: 75
    }, {
      label: "Detail",
      value: 80
    }, {
      label: "Urgency",
      value: 60
    }, {
      label: "Support",
      value: 45
    }],
    supporters: 3,
    suggest: "Yes, do it"
  }, {
    id: 2,
    from: "Lukas Becker",
    role: "Production, Line 2",
    raised: "14 Oct",
    title: "Rework on the 4-series housing is back — new batch of castings",
    solves: "The castings from the new supplier need the same hand-finish we removed with the fixture redesign. Three people are doing it off-plan.",
    sent: "14 Oct",
    badge: "2 d late",
    tone: "late",
    affects: ["Production"],
    facts: [["Worth", "≈ 30 h / month rework"], ["Flagged as", "no time"], ["Owner on the map", "You · Fixture, tooling or line layout"], ["Open for", "7 days"], ["History", "Past the promise since yesterday — Markus Roth sees it too."]],
    scores: [{
      label: "Value",
      value: 80
    }, {
      label: "Fit",
      value: 85
    }, {
      label: "Detail",
      value: 60
    }, {
      label: "Urgency",
      value: 95
    }, {
      label: "Support",
      value: 35
    }],
    supporters: 0,
    suggest: "Discuss first"
  }, {
    id: 3,
    from: "Stefan Dahl",
    role: "Line 3",
    raised: "Saturday",
    title: "Night shift has no one who can sign a €300 parts order",
    solves: "When a belt goes at 02:00 we wait for the day shift to approve a €300 replacement. Twice last month the line stood until 07:30.",
    sent: "Saturday",
    badge: "1 d left",
    tone: "left",
    affects: ["Production", "Finance"],
    facts: [["Worth", "≈ 11 h line stop / month"], ["Flagged as", "money"], ["Owner on the map", "You · Shift plan, staffing, overtime"], ["Open for", "4 days"]],
    scores: [{
      label: "Value",
      value: 85
    }, {
      label: "Fit",
      value: 90
    }, {
      label: "Detail",
      value: 75
    }, {
      label: "Urgency",
      value: 80
    }, {
      label: "Support",
      value: 60
    }],
    supporters: 4,
    suggest: "Yes, do it"
  }, {
    id: 4,
    from: "Jonas Schmidt",
    role: "Line 3",
    raised: "Saturday",
    title: "Ear defenders in two sizes at the press",
    solves: "We only stock one size. On smaller heads it slips, so people take it off at the loud press - exactly where they need it most.",
    sent: "Saturday",
    badge: "2 d left",
    tone: "left",
    affects: ["Production", "Safety"],
    facts: [["Worth", "safety, ≈ €120 once"], ["Owner on the map", "You · Workplace and lighting"], ["Open for", "4 days"]],
    scores: [{
      label: "Value",
      value: 65
    }, {
      label: "Fit",
      value: 80
    }, {
      label: "Detail",
      value: 70
    }, {
      label: "Urgency",
      value: 75
    }, {
      label: "Support",
      value: 20
    }],
    supporters: 1,
    suggest: "Yes, do it"
  }, {
    id: 5,
    from: "Jonas Schmidt",
    role: "Line 3",
    raised: "Monday",
    title: "Move the shift handover notes onto a board by the line",
    solves: "Handover notes live in a binder in the break room, so the next shift reads them after the first problem instead of before it.",
    sent: "Monday",
    badge: "paused",
    tone: undefined,
    affects: ["Production"],
    facts: [["Worth", "≈ 10 min / handover"], ["Owner on the map", "You · Shift plan, staffing, overtime"], ["Open for", "2 days · clock paused"]],
    scores: [{
      label: "Value",
      value: 70
    }, {
      label: "Fit",
      value: 75
    }, {
      label: "Detail",
      value: 85
    }, {
      label: "Urgency",
      value: 55
    }, {
      label: "Support",
      value: 80
    }],
    supporters: 6,
    suggest: "Yes, do it"
  }],
  feed: [{
    id: 1,
    from: "Jonas Schmidt",
    dept: "Production, Line 3 · Ulm HQ · 3 d",
    stage: "Under review",
    tone: "review",
    img: "09-quality",
    stat: "Right",
    hook: "first time, less scrap",
    title: "Daylight lamps above the inspection table",
    support: 0,
    comments: 0,
    tags: ["Production", "Quality"]
  }, {
    id: 2,
    from: "Jonas Schmidt",
    dept: "Production, Line 3 · Ulm HQ · 4 d",
    stage: "Under review",
    tone: "review",
    img: "03-safety",
    stat: "Safe",
    hook: "at the loudest press",
    title: "Ear defenders in two sizes at the press",
    support: 0,
    comments: 0,
    tags: ["Production"]
  }, {
    id: 3,
    from: "Jonas Schmidt",
    dept: "Production, Line 3 · Ulm HQ · 1 w",
    stage: "Under review",
    tone: "review",
    img: "08-less-paperwork",
    stat: "Once",
    hook: "entered, not twice",
    title: "Changeover sheet and MES ask for the same six numbers",
    support: 0,
    comments: 0,
    tags: ["Production"]
  }, {
    id: 4,
    from: "Jonas Schmidt",
    dept: "Production, Line 3 · Ulm HQ · 2 w",
    stage: "Needs info",
    tone: "review",
    img: "07-energy",
    stat: "Saved",
    hook: "lights off after the shift",
    title: "Hall lights on a timer after the late shift",
    support: 2,
    comments: 1,
    tags: ["Ops & Admin"]
  }, {
    id: 5,
    from: "Lukas Becker",
    dept: "Production, Line 2 · Ulm HQ · 3 w",
    stage: "Approved",
    tone: "approved",
    img: "10-parts-in-stock",
    stat: "€4k",
    hook: "in rush orders a year",
    title: "Spare seals for line 3 kept at the line",
    support: 9,
    comments: 2,
    tags: ["Production"],
    archived: true
  }, {
    id: 6,
    from: "Hans Sander",
    dept: "Quality · Ulm HQ · 1 m",
    stage: "Live",
    tone: "dark",
    img: "06-onboarding",
    stat: "11 days",
    hook: "from 5 weeks to start",
    title: "Bundle new-hire access into one request",
    support: 24,
    comments: 11,
    tags: ["HR / IT"],
    archived: true
  }],
  project: {
    raised: "Raised 19 Oct · Production, Line 3",
    title: "Move the shift handover notes onto a board by the line",
    steps: [{
      label: "Raised",
      sub: "19 Oct",
      tone: "done"
    }, {
      label: "AI check",
      sub: "Passed · 19 Oct",
      tone: "done"
    }, {
      label: "Team lead",
      sub: "Question for you",
      tone: "now"
    }, {
      label: "Decision",
      sub: "Due 25 Oct",
      tone: "todo"
    }, {
      label: "In progress",
      sub: "",
      tone: "todo"
    }],
    desk: {
      name: "Thomas Vogel",
      role: "Team lead, 4-series",
      initials: "TV",
      tone: "blue",
      used: 0.2,
      label: "1 d of the 5-day promise · clock paused"
    },
    body: "Handover notes live in a binder in the break room, so the next shift reads them after the first problem instead of before it. A board at the line, filled in during the last ten minutes of the shift, gets read on the way in.",
    who: [{
      label: "Raised by",
      value: "Jonas Schmidt · Line 3"
    }, {
      label: "Team",
      value: "Production"
    }, {
      label: "Responsible",
      value: "Thomas Vogel · Team lead, 4-series",
      sub: "Owns “Shift plan, staffing, overtime” on the routing map; the handover routine is his."
    }, {
      label: "Next in line",
      value: "Hans Sander · Quality lead",
      sub: "Deputy on the map: the idea moves to him if the five-day promise is missed."
    }],
    scores: [{
      label: "Value",
      value: 70
    }, {
      label: "Feasibility",
      value: 85
    }, {
      label: "Cost",
      value: 90
    }, {
      label: "Fit",
      value: 75
    }, {
      label: "Risk",
      value: 80
    }],
    found: "Move the shift handover notes from the break-room binder onto a board at line 3, written in the last ten minutes of each shift. It saves about ten minutes per handover and costs about €150.",
    foundSub: "In 44 of 61 handovers in September the first part ran more than eight minutes late, mostly because the next shift asked around instead of reading the binder.",
    bars: [{
      label: "Line 3 today",
      value: 1,
      display: "11 min"
    }, {
      label: "Line 4, board at the line",
      value: 0.27,
      display: "3 min"
    }],
    thread: [{
      role: "them",
      initials: "TV",
      tone: "blue",
      when: "yesterday",
      text: "Good one. Which board do you mean - the one at the line entrance or the team board by the coffee machine? And who writes the notes at 22:00, when the shift lead is already at the press?"
    }]
  },
  sent: [{
    title: "Changeover sheet and MES ask for the same six numbers",
    status: "Waiting for an answer",
    tone: "accent",
    submitted: "You raised this 10 Oct · Anonymous #4471",
    steps: [["Sent", "10 Oct", "done"], ["Read", "pending", "now"], ["Answered", "due 15 Oct", "todo"], ["Live", "—", "todo"]],
    now: "Sent to T. Vogel. They owe you a yes, a no or a question by 15 Oct.",
    reply: "No reply yet. T. Vogel has been told; if they miss the date it moves to H. Sander automatically.",
    replyBy: "the 5-day clock started 10 Oct",
    history: true
  }, {
    title: "Team-level spend authority up to €5k",
    status: "Awaiting decision",
    tone: "accent",
    submitted: "You co-signed this 24 Sept · Anonymous #4471",
    steps: [["Sent", "24 Sept", "done"], ["Read", "25 Sept", "done"], ["Answered", "overdue", "late"], ["Live", "—", "todo"]],
    now: "19 days waiting — 14 days past the promise. Escalated one level up.",
    overdue: true,
    reply: "Needs a CFO signature to move beyond the two pilot sites — that signature is what the 19 days are.",
    replyBy: "C. Ilg · proposer"
  }, {
    title: "Stop double-entering job data on paper",
    status: "Being built",
    tone: "grey",
    submitted: "You raised this 1 Jul · Anonymous #4471",
    steps: [["Sent", "1 Jul", "done"], ["Read", "2 Jul", "done"], ["Answered", "3 Jul", "done"], ["Live", "due 25 Oct", "now"]],
    now: "Answered in 2 days. In build since 25 Sept — day 18 of 30.",
    reply: "Agreed and funded. Two people on it: offline job sheets that sync when you get signal. Want to test the first build with us?",
    replyBy: "D. Ferraro · 3 Jul",
    outcome: ["What it should change", "expected −3 h / week / technician", "will be measured 14 days after launch"],
    history: true,
    canReply: "D. Ferraro"
  }, {
    title: "Bundle new-hire access into one request",
    status: "Live",
    tone: "ink",
    submitted: "You raised this 12 Apr · Anonymous #4471",
    steps: [["Sent", "12 Apr", "done"], ["Read", "13 Apr", "done"], ["Answered", "15 Apr", "done"], ["Live", "31 Jul", "done"]],
    now: "Answered in 3 days. Live since 31 Jul.",
    reply: "We are doing this. One template at contract signature, HR raises it, IT pre-provisions. You are credited on the rollout note.",
    replyBy: "L. Brandt · 15 Apr",
    outcome: ["What it changed", "5 weeks → 11 days", "measured across 9 new hires"],
    history: true
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.AvatarTone = __ds_scope.AvatarTone;

__ds_ns.Initials = __ds_scope.Initials;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Bars = __ds_scope.Bars;

__ds_ns.Btn = __ds_scope.Btn;

__ds_ns.Empty = __ds_scope.Empty;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.StatusTone = __ds_scope.StatusTone;

__ds_ns.Quote = __ds_scope.Quote;

__ds_ns.Steps = __ds_scope.Steps;

__ds_ns.Tile = __ds_scope.Tile;

__ds_ns.Stats = __ds_scope.Stats;

__ds_ns.IconPaths = __ds_scope.IconPaths;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.RaiseComposer = __ds_scope.RaiseComposer;

__ds_ns.Ground = __ds_scope.Ground;

__ds_ns.NavPill = __ds_scope.NavPill;

__ds_ns.ShellBar = __ds_scope.ShellBar;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.FilterChip = __ds_scope.FilterChip;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ChatMessage = __ds_scope.ChatMessage;

__ds_ns.ProgressRail = __ds_scope.ProgressRail;

__ds_ns.DecisionList = __ds_scope.DecisionList;

__ds_ns.FeedPanel = __ds_scope.FeedPanel;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.InfoPanel = __ds_scope.InfoPanel;

__ds_ns.BarsPanel = __ds_scope.BarsPanel;

__ds_ns.PillButton = __ds_scope.PillButton;

__ds_ns.ScoreGauge = __ds_scope.ScoreGauge;

__ds_ns.ScoreRow = __ds_scope.ScoreRow;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.StepTrack = __ds_scope.StepTrack;

__ds_ns.DeskStrip = __ds_scope.DeskStrip;

})();
