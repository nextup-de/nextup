import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiV1 } from "@nextup/contracts/public";
import { buildOpenApi, renderOpenApi, validateOpenApi } from "@/features/api/openapi";

type Doc = ReturnType<typeof buildOpenApi>;
type Op = {
  operationId: string;
  security: unknown;
  "x-nextup-scope": string;
  parameters: { name: string; in: string }[];
  responses: Record<string, { content: { "application/json": { schema: { $ref: string } } } }>;
};

const clone = (): Doc => JSON.parse(JSON.stringify(buildOpenApi())) as Doc;
const byPath = (doc: Doc) => doc.paths as Record<string, Record<string, Op>>;
const operations = (doc: Doc): Op[] => Object.values(byPath(doc)).flatMap((item) => Object.values(item));

describe("API OpenAPI", () => {
  it("has one operation per ApiV1 endpoint with its scope, bearer security and the error responses", () => {
    const doc = buildOpenApi();
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(operations(doc).map((o) => o.operationId).sort()).toEqual(ApiV1.endpoints.map((e) => e.id).sort());
    for (const e of ApiV1.endpoints) {
      const path = `${ApiV1.base.replace("[company]", "{company}")}${e.path}`;
      const op = byPath(doc)[path][e.method.toLowerCase()];
      expect(op.operationId).toBe(e.id);
      expect(op["x-nextup-scope"]).toBe(e.scope);
      expect(op.security).toEqual([{ bearerAuth: [] }]);
      for (const status of ["400", "401", "403", "404", "429", "500"]) {
        expect(op.responses[status].content["application/json"].schema.$ref).toBe("#/components/schemas/ApiV1Error");
      }
    }
  });

  it("is accepted by validateOpenApi", () => {
    expect(validateOpenApi(buildOpenApi())).toEqual([]);
  });

  it("rejects an undeclared path parameter", () => {
    const doc = clone();
    const op = operations(doc).find((o) => o.operationId === "cases.get")!;
    op.parameters = op.parameters.filter((p) => p.name !== "id");
    expect(validateOpenApi(doc).join("\n")).toContain("{id}");
  });

  it("rejects a dangling $ref", () => {
    const doc = clone();
    operations(doc)[0].responses["400"].content["application/json"].schema.$ref = "#/components/schemas/Nope";
    expect(validateOpenApi(doc).join("\n")).toContain("Nope");
  });

  it("rejects a duplicate operationId", () => {
    const doc = clone();
    const ops = operations(doc);
    ops[1].operationId = ops[0].operationId;
    expect(validateOpenApi(doc).join("\n")).toContain("not unique");
  });

  it("matches the committed docs/api/openapi.json", () => {
    const expected = renderOpenApi();
    const actual = readFileSync(resolve(__dirname, "../../../../../docs/api/openapi.json"), "utf8");
    if (actual !== expected) console.log(`docs/api/openapi.json is out of date; replace it with:\n${expected}`);
    expect(actual).toBe(expected);
  });
});
