// PatchOp (RFC 7644 section 3.5.2) on a SCIM user document. Pure. Entra and Okta shapes: `op` in any case, with or
// without `path`, `path` as a dotted name, a value filter (`emails[type eq "work"].value`) or an extension URN
// (`urn:…:enterprise:2.0:User:department`), and booleans as the strings "True" / "False".
import { ScimFailure } from "./errors";
import { asBool, isObj, SCIM_ENTERPRISE, type ScimDoc } from "./map";

export type PatchOp = { op: string; path?: string; value?: unknown };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const findKey = (o: ScimDoc, name: string): string | undefined => Object.keys(o).find((k) => k.toLowerCase() === name.toLowerCase());

type Filter = { attr: string; value: string };
type Target = { container: ScimDoc; attr: string; filter?: Filter; sub?: string };

const VALUE_PATH = /^([A-Za-z][\w$-]*)\[\s*([A-Za-z][\w$-]*)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*\](?:\.([A-Za-z][\w$-]*))?$/;
const NAME = /^[A-Za-z][\w$-]*$/;

function plain(container: ScimDoc, p: string): Target {
  const [head, sub, ...rest] = p.split(".");
  if (!NAME.test(head ?? "") || rest.length > 0 || (sub !== undefined && !NAME.test(sub))) throw new ScimFailure(400, "invalidPath", "Unsupported path.");
  return { container, attr: head, sub };
}

function resolve(doc: ScimDoc, path: string): Target {
  const p = path.trim();
  const urn = SCIM_ENTERPRISE.toLowerCase() + ":";
  if (p.toLowerCase().startsWith(urn)) {
    const extKey = findKey(doc, SCIM_ENTERPRISE) ?? SCIM_ENTERPRISE;
    const target = plain({}, p.slice(urn.length));
    if (!isObj(doc[extKey])) doc[extKey] = {};
    return { ...target, container: doc[extKey] as ScimDoc };
  }
  const vm = VALUE_PATH.exec(p);
  if (vm) return { container: doc, attr: vm[1], filter: { attr: vm[2], value: vm[3].replace(/\\(.)/g, "$1") }, sub: vm[4] };
  return plain(doc, p);
}

const matches = (item: unknown, f: Filter): boolean =>
  isObj(item) && String(item[findKey(item, f.attr) ?? f.attr] ?? "").toLowerCase() === f.value.toLowerCase();

const normalise = (attr: string, v: unknown): unknown => (attr.toLowerCase() === "active" ? (asBool(v) ?? v) : v);

function setValue(t: Target, op: "add" | "replace", value: unknown): void {
  const k = findKey(t.container, t.attr) ?? t.attr;
  const cur = t.container[k];
  if (t.filter) {
    const f = t.filter;
    const list = Array.isArray(cur) ? cur : [];
    const hit = list.filter((i) => matches(i, f));
    if (hit.length === 0) {
      if (op === "replace") throw new ScimFailure(400, "noTarget", "No value matches the path filter.");
      const item: ScimDoc = { [f.attr]: f.value };
      if (t.sub) item[t.sub] = value;
      else if (isObj(value)) Object.assign(item, value);
      t.container[k] = [...list, item];
      return;
    }
    for (const i of hit) {
      if (!isObj(i)) continue;
      if (t.sub) i[findKey(i, t.sub) ?? t.sub] = value;
      else if (isObj(value)) Object.assign(i, value);
    }
    return;
  }
  if (t.sub) {
    if (!isObj(cur)) t.container[k] = {};
    const o = t.container[k] as ScimDoc;
    o[findKey(o, t.sub) ?? t.sub] = value;
    return;
  }
  if (op === "add" && Array.isArray(cur) && Array.isArray(value)) {
    t.container[k] = [...cur, ...value];
    return;
  }
  if (op === "add" && isObj(cur) && isObj(value)) {
    Object.assign(cur, value);
    return;
  }
  t.container[k] = normalise(t.attr, value);
}

function removeValue(t: Target): void {
  const k = findKey(t.container, t.attr);
  if (k === undefined) return;
  const cur = t.container[k];
  const sub = t.sub;
  if (t.filter) {
    const f = t.filter;
    if (!Array.isArray(cur)) return;
    if (sub) {
      for (const i of cur) if (matches(i, f) && isObj(i)) delete i[findKey(i, sub) ?? sub];
    } else t.container[k] = cur.filter((i) => !matches(i, f));
    return;
  }
  if (sub) {
    if (isObj(cur)) delete cur[findKey(cur, sub) ?? sub];
    return;
  }
  delete t.container[k];
}

/** An op without `path`: its value is an object of attribute (or path) -> value. */
function applyPathless(doc: ScimDoc, op: "add" | "replace", value: unknown): void {
  if (!isObj(value)) throw new ScimFailure(400, "invalidValue", "An operation without a path needs an object value.");
  for (const [k, v] of Object.entries(value)) {
    // The extension arrives as a nested object under its URN; any other key may itself be a path.
    if (k.toLowerCase() === SCIM_ENTERPRISE.toLowerCase() && isObj(v)) {
      for (const [ek, ev] of Object.entries(v)) setValue(resolve(doc, `${SCIM_ENTERPRISE}:${ek}`), op, ev);
      continue;
    }
    setValue(resolve(doc, k), op, v);
  }
}

/** Apply the operations in order to a copy of `user`. Throws ScimFailure 400 for anything it cannot apply. */
export function applyPatch(user: ScimDoc, ops: readonly PatchOp[]): ScimDoc {
  const doc = clone(user);
  for (const raw of ops) {
    const op = typeof raw?.op === "string" ? raw.op.trim().toLowerCase() : "";
    const path = typeof raw.path === "string" && raw.path.trim() ? raw.path : undefined;
    if (op === "add" || op === "replace") {
      if (path === undefined) applyPathless(doc, op, raw.value);
      else setValue(resolve(doc, path), op, raw.value);
    } else if (op === "remove") {
      if (path === undefined) throw new ScimFailure(400, "noTarget", "remove needs a path.");
      removeValue(resolve(doc, path));
    } else {
      throw new ScimFailure(400, "invalidSyntax", "op must be add, replace or remove.");
    }
  }
  return doc;
}

/** The Operations array of a PatchOp body, however the client spells the key. Throws ScimFailure 400 otherwise. */
export function operationsOf(body: unknown): PatchOp[] {
  if (!isObj(body)) throw new ScimFailure(400, "invalidSyntax", "The body is not a PatchOp.");
  const k = findKey(body, "Operations");
  const ops = k === undefined ? undefined : body[k];
  if (!Array.isArray(ops) || ops.length === 0 || !ops.every(isObj)) throw new ScimFailure(400, "invalidSyntax", "Operations must be a non-empty array.");
  return ops as PatchOp[];
}
