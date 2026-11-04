// The syslog sink (EID D13): RFC 5424, one record per message. UDP is one datagram a record; TCP and TLS
// frame with octet counting (RFC 6587), TLS needs 1.2 or newer and a verified server certificate (system
// CAs plus `caPem`). One connection per batch, 10 s for all of it. A write resolves only after the bytes
// left, so the exporter may move its cursor on it.
import dgram from "node:dgram";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import { PUBLIC_CONTRACT_VERSION, type LogRecord, type LogSink } from "@nextup/contracts/public";

/** Facility log audit (13) * 8 + severity info (6). */
export const PRI = 110;
/** The documentation enterprise number until NextUp has its own. */
const ENTERPRISE = 32473;
const TIMEOUT_MS = 10_000;

const sdValue = (s: string): string => s.replace(/[\\"\]]/g, (c) => "\\" + c);
const token = (s: string): string => s.replace(/[^\x21-\x7e]/g, "_") || "-";

export function formatRfc5424(record: LogRecord, o: { hostname: string; appName: string }): string {
  const payload = JSON.stringify({ ...record.data, actorUserId: record.actorUserId, target: record.target });
  const sd = `[nextup@${ENTERPRISE} id="${sdValue(record.id)}" companyId="${sdValue(record.companyId)}"]`;
  return `<${PRI}>1 ${record.at} ${token(o.hostname)} ${token(o.appName)} - ${token(record.type)} ${sd} ${payload}`;
}

/** RFC 6587 octet counting: the byte length, a space, the message. */
export const frame = (msg: string): Buffer => {
  const body = Buffer.from(msg, "utf8");
  return Buffer.concat([Buffer.from(`${body.length} `, "utf8"), body]);
};

export type SyslogOptions = {
  host: string;
  port: number;
  transport: "tls" | "tcp" | "udp";
  caPem?: string | null;
  appName: string;
  hostname?: string;
};

function sendDatagrams(o: SyslogOptions, messages: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(net.isIPv6(o.host) ? "udp6" : "udp4");
    let finished = false;
    const done = (err?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => done(new Error("syslog: timeout")), TIMEOUT_MS);
    socket.on("error", done);
    let left = messages.length;
    if (left === 0) return done();
    for (const m of messages) {
      socket.send(Buffer.from(m, "utf8"), o.port, o.host, (err) => {
        if (err) return done(err);
        if (--left === 0) done();
      });
    }
  });
}

function sendStream(o: SyslogOptions, messages: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.concat(messages.map(frame));
    let finished = false;
    const done = (err?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (err) { socket.destroy(); reject(err); } else resolve();
    };
    const onReady = () => socket.end(payload, () => done());
    const socket =
      o.transport === "tls"
        ? tls.connect({
            host: o.host,
            port: o.port,
            ca: [...tls.rootCertificates, ...(o.caPem ? [o.caPem] : [])],
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
            ...(net.isIP(o.host) ? {} : { servername: o.host }),
          }, onReady)
        : net.connect({ host: o.host, port: o.port }, onReady);
    const timer = setTimeout(() => done(new Error("syslog: timeout")), TIMEOUT_MS);
    socket.on("error", done);
    socket.on("close", () => done(new Error("syslog: connection closed")));
  });
}

export function syslogSink(o: SyslogOptions): LogSink {
  const hostname = o.hostname ?? os.hostname();
  return {
    info: { kind: "LogSink", id: "syslog", contractVersion: PUBLIC_CONTRACT_VERSION },
    async write(records) {
      if (records.length === 0) return;
      const messages = records.map((r) => formatRfc5424(r, { hostname, appName: o.appName }));
      if (o.transport === "udp") await sendDatagrams(o, messages);
      else await sendStream(o, messages);
    },
  };
}
