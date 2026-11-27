// Stylelint rule nextup/spacing-scale: padding, margin and gap use only the spacing scale in tokens.css
// (var(--nh-sp-N) or a named space like var(--nh-gap)), plus 0 and 1px. A raw length is reported with the
// step to use; `npm run design:spacing-fix` writes those steps in. docs/DESIGN_SCALE.md.
import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import { SPACING_PROP, SPACING_FREE, layoutFrom, nearestSpace, readScale, spaceCss } from "./scale.mjs";

const ruleName = "nextup/spacing-scale";
const messages = stylelint.utils.ruleMessages(ruleName, {
  raw: (prop, value, fix) => `Use the spacing scale for "${prop}": ${fix} instead of ${value} (docs/DESIGN_SCALE.md, npm run design:spacing-fix).`,
  step: (name) => `${name} is not a step of the spacing scale (src/styles/tokens.css).`,
});

const LENGTH = /^(-?)(\d*\.?\d+)(px|rem)$/;

const rule = (enabled) => (root, result) => {
  if (!enabled) return;
  const { spacing } = readScale();
  const steps = new Set(spacing);
  root.walkDecls((decl) => {
    if (!SPACING_PROP.test(decl.prop.toLowerCase())) return;
    valueParser(decl.value).walk((node) => {
      if (node.type === "function" && node.value === "var") {
        const name = node.nodes[0]?.value ?? "";
        const m = /^--nh-sp-(\d+)$/.exec(name);
        if (m && !steps.has(Number(m[1]))) stylelint.utils.report({ ruleName, result, node: decl, message: messages.step(name), word: name });
        return false; // a var's fallback is not checked
      }
      if (node.type !== "word") return;
      const m = LENGTH.exec(node.value);
      if (!m) return;
      const px = Number(m[2]) * (m[3] === "rem" ? 16 : 1);
      if (m[3] === "px" && SPACING_FREE.has(px)) return;
      if (px > layoutFrom(spacing)) return;
      const fix = spaceCss(nearestSpace(px, spacing), m[1] === "-");
      stylelint.utils.report({ ruleName, result, node: decl, message: messages.raw(decl.prop, node.value, fix), word: node.value });
    });
  });
};
rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
