// The Teams app package (TMS D15): the four files of ops/teams/ with this stack's app id and host filled in,
// as a zip (stored, no compression). node:zlib's crc32 and Buffer only; no dependency.
import { readFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";

const FILES = ["manifest.json", "de.json", "color.png", "outline.png"] as const;
type PackageFile = (typeof FILES)[number];

/**
 * ops/teams/ sits at the repo root, two levels above apps/app (the cwd of `next` and of the standalone server).
 * The runtime image has the folder at /app/ops/teams only because Next's file tracing follows this read
 * (ops/Dockerfile copies nothing else; checked in an image built from 46f2fd4d). Keep the path a plain
 * path.join on process.cwd(), or add the folder to outputFileTracingIncludes.
 */
function read(name: PackageFile): Buffer {
  const here = path.join(process.cwd(), "..", "..", "ops", "teams", name);
  try {
    return readFileSync(here);
  } catch {
    return readFileSync(path.join(process.cwd(), "ops", "teams", name)); // run from the repo root
  }
}

/** The host a manifest may name: no scheme, no path, no quotes. */
function cleanHost(host: string): string {
  const h = host.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(h)) throw new Error("not a host name");
  return h;
}

function fill(text: string, appId: string, host: string): string {
  return text.split("${{TEAMS_APP_ID}}").join(appId).split("${{HOST}}").join(host);
}

// 2026-01-01 00:00:00 in DOS date and time, so the same input gives the same bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A zip of the files, stored. `entries` keep their order. */
export function storedZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4); // version made by
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(DOS_TIME, 12);
    head.writeUInt16LE(DOS_DATE, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBytes.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(head, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** The app package for this stack's bot (`appId`) and public host (`host`, e.g. nextup.example.com). */
export function buildAppPackage({ appId, host }: { appId: string; host: string }): Buffer {
  if (!/^[A-Za-z0-9-]+$/.test(appId)) throw new Error("not an app id");
  const h = cleanHost(host);
  return storedZip(
    FILES.map((name) => {
      const raw = read(name);
      return { name, data: name.endsWith(".json") ? Buffer.from(fill(raw.toString("utf8"), appId, h), "utf8") : raw };
    }),
  );
}
