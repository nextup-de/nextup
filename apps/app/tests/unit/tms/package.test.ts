import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildAppPackage } from "@/server/teams/package";

type Entry = { name: string; method: number; crc: number; data: Buffer };

/** The zip's central directory, read by hand. */
function unzip(zip: Buffer): Entry[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(0);
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    out.push({ name, method, crc, data: method === 0 ? raw : inflateRawSync(raw) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const pngSize = (b: Buffer) => {
  expect(b.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(b.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe("TMS app package", () => {
  const zip = buildAppPackage({ appId: "11111111-2222-3333-4444-555555555555", host: "https://nextup.example.com/" });
  const files = new Map(unzip(zip).map((e) => [e.name, e]));

  it("is a stored zip of manifest.json, de.json, color.png and outline.png with valid checksums", () => {
    expect([...files.keys()]).toEqual(["manifest.json", "de.json", "color.png", "outline.png"]);
    for (const e of files.values()) {
      expect(e.method).toBe(0);
      expect(crc32(e.data) >>> 0).toBe(e.crc);
    }
  });

  it("fills the app id and host into the manifest and leaves no placeholder", () => {
    const text = files.get("manifest.json")!.data.toString("utf8");
    expect(text).not.toContain("${{");
    const m = JSON.parse(text);
    expect(m.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(m.validDomains).toEqual(["nextup.example.com"]);
    expect(m.manifestVersion).toBe("1.17");
    expect(m.bots[0]).toMatchObject({ botId: m.id, scopes: ["personal"] });
    const raise = m.composeExtensions[0].commands[0];
    expect(raise).toMatchObject({ id: "raise", type: "action", fetchTask: true });
    expect([...raise.context].sort()).toEqual(["commandBox", "compose", "message"]);
    expect(JSON.parse(files.get("de.json")!.data.toString("utf8"))["name.short"]).toBe("NextUp");
  });

  it("has a 192 pixel colour icon and a 32 pixel outline icon", () => {
    expect(pngSize(files.get("color.png")!.data)).toEqual([192, 192]);
    expect(pngSize(files.get("outline.png")!.data)).toEqual([32, 32]);
  });

  it("refuses a host or an app id that is not one", () => {
    expect(() => buildAppPackage({ appId: "x", host: "a\"b" })).toThrow();
    expect(() => buildAppPackage({ appId: "x\"", host: "a.b" })).toThrow();
  });
});
