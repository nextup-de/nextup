// SEC-V1 (D8): the vault reads with a previous key during a rotation, and every sealed column is re-sealed.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { open, openWith, seal, vaultKey, vaultPreviousKey } from "@/features/connectors/vault";
import { RESEALED_COLUMNS } from "@/lib/db/vault-reseal";

const OLD_HEX = "11".repeat(32);
const NEW_HEX = "22".repeat(32);
const oldKey = Buffer.from(OLD_HEX, "hex");
const newKey = Buffer.from(NEW_HEX, "hex");
const CTX = "integration:c1:jira";

afterEach(() => vi.unstubAllEnvs());

describe("SEC vault keys", () => {
  it("reads the previous key in both formats and ignores a malformed one", () => {
    expect(vaultPreviousKey({ CONNECTOR_VAULT_KEY_PREVIOUS: OLD_HEX })?.equals(oldKey)).toBe(true);
    expect(vaultPreviousKey({ CONNECTOR_VAULT_KEY_PREVIOUS: oldKey.toString("base64") })?.equals(oldKey)).toBe(true);
    expect(vaultPreviousKey({})).toBeNull();
    expect(vaultPreviousKey({ CONNECTOR_VAULT_KEY_PREVIOUS: "short" })).toBeNull();
    expect(vaultKey({ CONNECTOR_VAULT_KEY: NEW_HEX, CONNECTOR_VAULT_KEY_PREVIOUS: OLD_HEX })?.equals(newKey)).toBe(true);
  });

  it("opens a value sealed with the previous key only while CONNECTOR_VAULT_KEY_PREVIOUS is set", () => {
    const sealed = seal("secret", oldKey, CTX);
    expect(open(sealed, newKey, CTX)).toBeNull();
    vi.stubEnv("CONNECTOR_VAULT_KEY_PREVIOUS", OLD_HEX);
    expect(open(sealed, newKey, CTX)).toBe("secret");
    expect(open(sealed, newKey, "integration:c2:jira")).toBeNull();
    vi.stubEnv("CONNECTOR_VAULT_KEY_PREVIOUS", "");
    expect(open(sealed, newKey, CTX)).toBeNull();
  });

  it("seals with the key it is given and keeps the v1 format", () => {
    vi.stubEnv("CONNECTOR_VAULT_KEY_PREVIOUS", OLD_HEX);
    const sealed = seal("secret", newKey, CTX);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(openWith(sealed, newKey, CTX)).toBe("secret");
    expect(openWith(sealed, oldKey, CTX)).toBeNull();
  });

  it("lists every sealed field of the Prisma schema in RESEALED_COLUMNS", () => {
    const dir = path.join(__dirname, "../../../prisma/schema");
    const found: string[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".prisma"))) {
      let model = "";
      for (const line of fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)) {
        const m = /^model\s+(\w+)\s*\{/.exec(line);
        if (m) model = m[1];
        else if (/^\}/.test(line)) model = "";
        const f = /^\s+(\w+)\s+\S/.exec(line);
        if (model && f && (/Sealed$/.test(f[1]) || (model === "WebhookSubscription" && f[1] === "secrets"))) found.push(`${model}.${f[1]}`);
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(5);
    const listed = RESEALED_COLUMNS.map((c) => `${c.model}.${c.field}`);
    expect(found.filter((f) => !listed.includes(f))).toEqual([]);
    expect(listed.filter((f) => !found.includes(f))).toEqual([]);
  });
});
