// OpenAPI 3.1 document for API v1, generated from the `ApiV1` table alone (ADR 0003, D10).
// No endpoint logic lives here: `buildOpenApi()` describes, `validateOpenApi()` checks the shape of what it made.
import { z } from "zod";
import * as contracts from "@nextup/contracts/public";
import { ApiV1 } from "@nextup/contracts/public";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/** Model schemas published under `components.schemas`, next to every `ApiV1*` export of api-v1.ts. */
const MODEL_NAMES = ["Person", "OrgUnit", "Role", "RoleHolder", "CaseRef", "Decision", "ProjectRef"] as const;

const ERROR_STATUS: readonly { status: string; description: string }[] = [
  { status: "400", description: "Bad request: the query or body does not match the schema." },
  { status: "401", description: "Unauthorized: the bearer token is missing, unknown or revoked." },
  { status: "403", description: "Forbidden: the token does not hold the scope this operation needs." },
  { status: "404", description: "Not found." },
  { status: "429", description: "Rate limited: slow down and retry." },
  { status: "500", description: "Internal error." },
];

const exported = contracts as Record<string, unknown>;

function componentSchemas(): JsonObject {
  const registry = z.registry<{ id: string }>();
  const names = [...Object.keys(exported).filter((n) => n.startsWith("ApiV1")), ...MODEL_NAMES].sort();
  for (const name of names) {
    const schema = exported[name];
    // The query is described as parameters, not as a schema.
    if (schema instanceof z.ZodType && name !== "ApiV1ListQuery") registry.add(schema, { id: name });
  }
  const out = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    io: "output",
    uri: (id: string) => `#/components/schemas/${id}`,
  } as never) as unknown as { schemas: Record<string, JsonObject> };
  const schemas: JsonObject = {};
  for (const name of Object.keys(out.schemas).sort()) {
    const { $schema: _schema, $id: _id, ...rest } = out.schemas[name];
    void _schema;
    void _id;
    schemas[name] = rest;
  }
  return schemas;
}

function ref(name: string): JsonObject {
  return { $ref: `#/components/schemas/${name}` };
}

/** The export name of an endpoint's schema, so operations point at `components.schemas`. */
function nameOf(schema: z.ZodType): string {
  for (const [name, value] of Object.entries(exported)) {
    if (value === schema && name.startsWith("ApiV1")) return name;
  }
  throw new Error("openapi: an endpoint uses a schema that is not an exported ApiV1 schema");
}

function queryParameters(query: z.ZodType): JsonObject[] {
  const json = z.toJSONSchema(query, { io: "input" }) as unknown as {
    properties?: Record<string, JsonObject>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema,
  }));
}

export function buildOpenApi(): JsonObject {
  const base = ApiV1.base.replace("[company]", "{company}");
  const paths: JsonObject = {};
  for (const e of ApiV1.endpoints) {
    const path = `${base}${e.path}`;
    const parameters: JsonObject[] = [
      { name: "company", in: "path", required: true, description: "Company slug.", schema: { type: "string" } },
    ];
    if (e.path.includes("{id}")) {
      parameters.push({ name: "id", in: "path", required: true, schema: { type: "string" } });
    }
    if (e.query) parameters.push(...queryParameters(e.query));

    const responses: JsonObject = {
      [e.method === "POST" ? "201" : "200"]: {
        description: "Success.",
        content: { "application/json": { schema: ref(nameOf(e.response)) } },
      },
    };
    for (const { status, description } of ERROR_STATUS) {
      responses[status] = { description, content: { "application/json": { schema: ref("ApiV1Error") } } };
    }

    const operation: JsonObject = {
      operationId: e.id,
      tags: [e.id.split(".")[0]],
      parameters,
      security: [{ bearerAuth: [] }],
      "x-nextup-scope": e.scope,
      responses,
    };
    if (e.request) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: ref(nameOf(e.request)) } },
      };
    }
    const item = (paths[path] ?? {}) as JsonObject;
    item[e.method.toLowerCase()] = operation;
    paths[path] = item;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "NextUp API",
      version: String(ApiV1.version),
      description: "Public API v1: cases, decisions, projects and the org chart. Authenticate with a company bearer token.",
    },
    servers: [{ url: "/" }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: componentSchemas(),
    },
  };
}

function resolves(doc: unknown, pointer: string): boolean {
  let node: unknown = doc;
  for (const raw of pointer.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (typeof node !== "object" || node === null || !(key in node)) return false;
    node = (node as Record<string, unknown>)[key];
  }
  return true;
}

function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") out.push(value);
      else collectRefs(value, out);
    }
  }
}

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function paramsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Problems found in an OpenAPI document; empty when it is sound. */
export function validateOpenApi(doc: unknown): string[] {
  if (typeof doc !== "object" || doc === null) return ["document is not an object"];
  const problems: string[] = [];
  const d = doc as Record<string, unknown>;
  if (typeof d.openapi !== "string" || !/^3\.1\.\d+/.test(d.openapi)) problems.push("openapi must be version 3.1.x");
  const info = d.info as Record<string, unknown> | undefined;
  if (!info || typeof info.title !== "string" || !info.title) problems.push("info.title is missing");
  if (!info || typeof info.version !== "string" || !info.version) problems.push("info.version is missing");
  if (typeof d.paths !== "object" || d.paths === null) {
    problems.push("paths is missing");
    return problems;
  }

  const ids = new Set<string>();
  for (const [path, rawItem] of Object.entries(d.paths)) {
    const item = (rawItem ?? {}) as Record<string, unknown>;
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const method of METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      const label = `${method.toUpperCase()} ${path}`;
      const declared = new Set(
        [...paramsOf(item.parameters), ...paramsOf(op.parameters)]
          .filter((p) => p.in === "path" && typeof p.name === "string")
          .map((p) => p.name as string),
      );
      for (const name of templated) {
        if (!declared.has(name)) problems.push(`${label}: path parameter {${name}} is not declared`);
      }
      const id = op.operationId;
      if (typeof id !== "string" || !id) problems.push(`${label}: operationId is missing`);
      else if (ids.has(id)) problems.push(`operationId ${id} is not unique`);
      else ids.add(id);
    }
  }

  const refs: string[] = [];
  collectRefs(doc, refs);
  for (const r of new Set(refs)) {
    if (!r.startsWith("#/") || !resolves(doc, r)) problems.push(`$ref ${r} does not resolve`);
  }
  return problems;
}

/** The text of docs/api/openapi.json: two-space JSON and a final newline. */
export function renderOpenApi(): string {
  return `${JSON.stringify(buildOpenApi(), null, 2)}\n`;
}
