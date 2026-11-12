// A fake SMTP relay for the PIL acceptance (PIL D14): just enough for the app's mail check (nodemailer's verify):
// it greets, answers EHLO, NOOP and QUIT, and refuses everything else. It takes no mail, keeps none, and nothing
// leaves this process. Plain node:net on 127.0.0.1.
import { createServer, type Socket } from "node:net";

export type FakeSmtp = {
  port: number;
  /** The verbs it was sent, in order (upper case), across all connections. */
  verbs: string[];
  /** Stops listening and drops open connections. */
  close: () => Promise<void>;
};

/** Listens on 127.0.0.1:`port`; 0 takes a free one (see `port` of the result). */
export function startFakeSmtp(port: number): Promise<FakeSmtp> {
  const verbs: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    const reply = (line: string) => socket.write(`${line}\r\n`);
    let buffer = "";
    reply("220 fake-smtp ready");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let at: number;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const verb = line.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
        verbs.push(verb);
        if (verb === "EHLO" || verb === "HELO") reply("250 fake-smtp");
        else if (verb === "NOOP") reply("250 ok");
        else if (verb === "QUIT") {
          reply("221 bye");
          socket.end();
        } else reply("502 not implemented");
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : port,
        verbs,
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
