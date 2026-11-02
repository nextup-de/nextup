// nextup/no-inline-strings (LNG decision D11): keeps user-facing English text out of components once it is in the
// message catalog. Plain ESTree / JSX node types only, no type information. Switched on by LNG-R1, not here.

const MESSAGE_ATTRIBUTES = new Set(["title", "placeholder", "alt", "aria-label", "label"]);
const MESSAGE_PROPERTIES = new Set(["title", "label", "text", "message", "subject", "placeholder"]);
const SILENT_ATTRIBUTES = /^(className|style|id|data-.*)$/;
const SENTENCE = /\p{Lu}\p{Ll}*(\s+[\p{L}'’-]+)+/u;
const TWO_LETTERS = /\p{L}{2}/u;
const TYPE_NODES = new Set([
  "TSLiteralType",
  "TSTypeAnnotation",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeParameterInstantiation",
  "TSEnumMember",
]);
const MESSAGE = "Move this text into the message catalog (src/i18n, docs: LNG).";

function attributeName(attr) {
  if (attr.name.type === "JSXNamespacedName") return `${attr.name.namespace.name}:${attr.name.name.name}`;
  return attr.name.name;
}

function propertyName(prop) {
  if (prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;
  return null;
}

/** Static text of a string literal or template literal; null for anything else. */
function staticText(node) {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : null;
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(" ");
  return null;
}

/** console.* calls and `new XError(...)` carry developer text. */
function isDeveloperCall(node) {
  if (node.type === "CallExpression") {
    const c = node.callee;
    return c.type === "MemberExpression" && c.object.type === "Identifier" && c.object.name === "console";
  }
  if (node.type === "NewExpression") return node.callee.type === "Identifier" && /Error$/.test(node.callee.name);
  return false;
}

/** The syntactic position of a string node decides whether it is a message position. */
function classify(node) {
  // Climb through value-preserving wrappers: `cond ? "a" : "b"`, `x || "a"`, `"a" as const`, `{...}`.
  let child = node;
  let parent = node.parent;
  while (
    parent &&
    ((parent.type === "ConditionalExpression" && parent.test !== child) ||
      parent.type === "LogicalExpression" ||
      parent.type === "TSAsExpression" ||
      parent.type === "TSSatisfiesExpression" ||
      parent.type === "TSNonNullExpression" ||
      parent.type === "JSXExpressionContainer")
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (!parent) return "sentence";
  if (parent.type === "JSXAttribute" && parent.value === child) {
    const name = attributeName(parent);
    if (SILENT_ATTRIBUTES.test(name)) return "skip";
    return MESSAGE_ATTRIBUTES.has(name) ? "message" : "sentence";
  }
  if (parent.type === "Property" && parent.value === child) {
    const name = propertyName(parent);
    return name !== null && MESSAGE_PROPERTIES.has(name) ? "message" : "sentence";
  }
  return "sentence";
}

function isIgnoredPosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    parent.type === "ImportDeclaration" ||
    parent.type === "ExportAllDeclaration" ||
    parent.type === "ExportNamedDeclaration" ||
    parent.type === "ImportExpression" ||
    parent.type === "TSExternalModuleReference"
  ) {
    return true;
  }
  if (parent.type === "ExpressionStatement" && typeof parent.directive === "string") return true;
  if (
    (parent.type === "Property" || parent.type === "PropertyDefinition" || parent.type === "MethodDefinition") &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }
  if (parent.type === "TaggedTemplateExpression" && parent.quasi === node) return true;
  for (let n = parent, child = node; n; child = n, n = n.parent) {
    if (TYPE_NODES.has(n.type)) return true;
    if (isDeveloperCall(n) && n.arguments.includes(child)) return true;
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow user-facing text outside the message catalog" },
    schema: [],
    messages: { inline: MESSAGE },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/");
    if (filename.includes("/src/i18n/messages/")) return {};

    function check(node) {
      const text = staticText(node);
      if (text === null || isIgnoredPosition(node)) return;
      const kind = classify(node);
      if (kind === "skip") return;
      const hit = kind === "message" ? TWO_LETTERS.test(text) : SENTENCE.test(text);
      if (hit) context.report({ node, messageId: "inline" });
    }

    return {
      JSXText(node) {
        if (TWO_LETTERS.test(node.value)) context.report({ node, messageId: "inline" });
      },
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

const plugin = { meta: { name: "nextup" }, rules: { "no-inline-strings": rule } };

export default plugin;
