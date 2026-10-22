// The token vault (src/features/connectors/vault.ts). The point of these: a sealed token opens only
// with the right key AND for the same company and person, and anything tampered with opens to null.
import { describe, expect, it } from "vitest";
import { open, seal, vaultContext, vaultKey } from "@/features/connectors/vault";

const KEY = vaultKey({ CONNECTOR_VAULT_KEY: "a".repeat(64) })!;
const OTHER_KEY = vaultKey({ CONNECTOR_VAULT_KEY: "b".repeat(64) })!;
const here = vaultContext("company-1", "user-1");

describe("vault key", () => {
  it("takes 64 hex characters only", () => {
    expect(KEY).toHaveLength(32);
    expect(vaultKey({})).toBeNull();
    expect(vaultKey({ CONNECTOR_VAULT_KEY: "" })).toBeNull();
    expect(vaultKey({ CONNECTOR_VAULT_KEY: "a".repeat(63) })).toBeNull();
    expect(vaultKey({ CONNECTOR_VAULT_KEY: "z".repeat(64) })).toBeNull();
  });
});

describe("seal and open", () => {
  it("round-trips", () => {
    const sealed = seal("refresh-token-value", KEY, here);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("refresh-token-value");
    expect(open(sealed, KEY, here)).toBe("refresh-token-value");
  });

  it("never seals the same value to the same text twice", () => {
    expect(seal("x", KEY, here)).not.toBe(seal("x", KEY, here));
  });

  it("does not open with another key", () => {
    expect(open(seal("t", KEY, here), OTHER_KEY, here)).toBeNull();
  });

  it("does not open for another person or another company", () => {
    const sealed = seal("t", KEY, here);
    expect(open(sealed, KEY, vaultContext("company-1", "user-2"))).toBeNull();
    expect(open(sealed, KEY, vaultContext("company-2", "user-1"))).toBeNull();
  });

  it("does not open when any part was changed", () => {
    const [v, iv, tag, body] = seal("token", KEY, here).split(".");
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(open([v, flip(iv), tag, body].join("."), KEY, here)).toBeNull();
    expect(open([v, iv, flip(tag), body].join("."), KEY, here)).toBeNull();
    expect(open([v, iv, tag, flip(body)].join("."), KEY, here)).toBeNull();
  });

  it("refuses other versions and garbage", () => {
    const sealed = seal("t", KEY, here);
    expect(open("v2" + sealed.slice(2), KEY, here)).toBeNull();
    expect(open(sealed + ".extra", KEY, here)).toBeNull();
    expect(open("", KEY, here)).toBeNull();
    expect(open("v1.only", KEY, here)).toBeNull();
  });
});
