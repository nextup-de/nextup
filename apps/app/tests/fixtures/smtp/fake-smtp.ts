// A tiny SMTP relay for the mail tests: node:net only, no TLS, no AUTH. It answers RCPT TO with whatever
// `answer(recipient)` says ("250 OK", "550 5.1.1 User unknown", "452 4.2.2 Mailbox full", ...), so a test can
// make a relay refuse a recipient for good (a hard bounce) or for now (a soft bounce) and see what the app
// does with it. It counts every RCPT TO and keeps every message it accepted.
import net from "node:net";
import type { AddressInfo } from "node:net";

export type FakeSmtp = Awaited<ReturnType<typeof startFakeSmtp>>;

export async function startFakeSmtp(answer: (recipient: string) => string = () => "250 2.1.5 OK") {
  const rcpts: string[] = [];
  const accepted: { to: string[]; data: string }[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let buf = "";
    let inData = false;
    let data = "";
    let to: string[] = [];
    const say = (line: string) => socket.write(line + "\r\n");
    say("220 fake-smtp ESMTP");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            accepted.push({ to, data });
            data = "";
            to = [];
            say("250 2.0.0 queued");
          } else data += line + "\n";
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO")) say("250-fake-smtp\r\n250 8BITMIME");
        else if (cmd.startsWith("HELO")) say("250 fake-smtp");
        else if (cmd.startsWith("MAIL FROM")) say("250 2.1.0 OK");
        else if (cmd.startsWith("RCPT TO")) {
          const rcpt = /<([^>]*)>/.exec(line)?.[1] ?? "";
          rcpts.push(rcpt);
          const a = answer(rcpt);
          if (a.startsWith("2")) to.push(rcpt);
          say(a);
        } else if (cmd === "DATA") {
          if (to.length === 0) say("554 5.5.1 No valid recipients");
          else {
            inData = true;
            say("354 go ahead");
          }
        } else if (cmd === "RSET") {
          to = [];
          say("250 OK");
        } else if (cmd === "QUIT") {
          say("221 bye");
          socket.end();
        } else say("250 OK");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `smtp://127.0.0.1:${port}`,
    rcpts,
    accepted,
    close: () => new Promise<void>((r) => {
      for (const s of sockets) s.destroy();
      server.close(() => r());
    }),
  };
}
