// A syslog receiver for tests (EID D18): UDP, TCP and TLS listeners on 127.0.0.1 that collect messages.
// TLS uses a certificate made at test time with the openssl CLI in os.tmpdir(); no key is ever committed.
// down() closes the listeners (connections are refused), up() listens again on the same ports.
import { execFileSync } from "node:child_process";
import dgram from "node:dgram";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

export type Receiver = {
  ports: { udp?: number; tcp?: number; tls?: number };
  /** Every message, in arrival order, across the transports. */
  messages: string[];
  by: { udp: string[]; tcp: string[]; tls: string[] };
  /** The certificate of the TLS listener (use as caPem). */
  caPem: string;
  waitFor(count: number, ms?: number): Promise<void>;
  stop(): Promise<void>;
  down(): Promise<void>;
  up(): Promise<void>;
};

/** Splits an octet-counted stream; the rest of an unfinished frame stays in the buffer. */
export function unframe(buf: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let rest = buf;
  for (;;) {
    const sp = rest.indexOf(0x20);
    if (sp < 1) break;
    const len = Number(rest.subarray(0, sp).toString("ascii"));
    if (!Number.isInteger(len) || len < 0) throw new Error("bad octet count");
    if (rest.length < sp + 1 + len) break;
    messages.push(rest.subarray(sp + 1, sp + 1 + len).toString("utf8"));
    rest = rest.subarray(sp + 1 + len);
  }
  return { messages, rest };
}

function makeCert(): { key: string; cert: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nextup-syslog-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
      "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"),
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
    return { key: readFileSync(path.join(dir, "k.pem"), "utf8"), cert: readFileSync(path.join(dir, "c.pem"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function startReceiver(want: { udp?: boolean; tcp?: boolean; tls?: boolean }): Promise<Receiver> {
  const messages: string[] = [];
  const by = { udp: [] as string[], tcp: [] as string[], tls: [] as string[] };
  const ports: Receiver["ports"] = {};
  const pem = want.tls ? makeCert() : { key: "", cert: "" };
  const sockets = new Set<net.Socket>();
  let udp: dgram.Socket | null = null;
  let tcp: net.Server | null = null;
  let tlsServer: tls.Server | null = null;

  const stream = (kind: "tcp" | "tls") => (socket: net.Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let buf: Buffer = Buffer.alloc(0);
    socket.on("data", (d: Buffer) => {
      const r = unframe(Buffer.concat([buf, d]));
      buf = r.rest;
      for (const m of r.messages) { by[kind].push(m); messages.push(m); }
    });
  };

  const listen = async () => {
    if (want.udp) {
      const s = dgram.createSocket("udp4");
      s.on("message", (m) => { const t = m.toString("utf8"); by.udp.push(t); messages.push(t); });
      await new Promise<void>((res) => s.bind(ports.udp ?? 0, "127.0.0.1", res));
      ports.udp = s.address().port;
      udp = s;
    }
    if (want.tcp) {
      const s = net.createServer(stream("tcp"));
      await new Promise<void>((res) => s.listen(ports.tcp ?? 0, "127.0.0.1", res));
      ports.tcp = (s.address() as net.AddressInfo).port;
      tcp = s;
    }
    if (want.tls) {
      const s = tls.createServer({ key: pem.key, cert: pem.cert, minVersion: "TLSv1.2" }, stream("tls"));
      await new Promise<void>((res) => s.listen(ports.tls ?? 0, "127.0.0.1", res));
      ports.tls = (s.address() as net.AddressInfo).port;
      tlsServer = s;
    }
  };

  const close = async () => {
    for (const s of sockets) s.destroy();
    sockets.clear();
    const u = udp; udp = null;
    if (u) await new Promise<void>((res) => u.close(() => res()));
    for (const s of [tcp, tlsServer]) if (s) await new Promise<void>((res) => s.close(() => res()));
    tcp = null; tlsServer = null;
  };

  await listen();
  return {
    ports, messages, by, caPem: pem.cert,
    async waitFor(count, ms = 5000) {
      const end = Date.now() + ms;
      while (messages.length < count && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    },
    stop: close,
    down: close,
    up: listen,
  };
}
