// A mail relay for one spec: accepts everything over SMTP and keeps it in memory, and hands the mails out over
// HTTP so the spec can read what went out. Nothing leaves this process.
//
//   node tests/e2e/db/fixtures/smtp-sink.mjs <smtpPort> <httpPort>
//   GET /health  -> 200
//   GET /mails   -> [{ to: ["a@b.test"], data: "<raw message>" }]
import { createServer as createHttp } from "node:http";
import { createServer as createTcp } from "node:net";

const [smtpPort, httpPort] = process.argv.slice(2).map(Number);
const mails = [];

createTcp((socket) => {
  let inData = false;
  let buffer = "";
  let to = [];
  let body = [];
  const reply = (line) => socket.write(`${line}\r\n`);
  reply("220 sink ESMTP");
  socket.setEncoding("utf8");
  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      if (inData) {
        if (line === ".") {
          mails.push({ to, data: body.join("\n") });
          inData = false;
          to = [];
          body = [];
          reply("250 kept");
        } else {
          body.push(line.startsWith("..") ? line.slice(1) : line);
        }
        continue;
      }
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === "EHLO" || verb === "HELO") reply("250 sink");
      else if (verb === "RCPT") {
        const address = /<([^>]+)>/.exec(line)?.[1];
        if (address) to.push(address.toLowerCase());
        reply("250 ok");
      } else if (verb === "DATA") {
        inData = true;
        reply("354 go on");
      } else if (verb === "QUIT") {
        reply("221 bye");
        socket.end();
      } else reply("250 ok"); // MAIL, RSET, NOOP
    }
  });
}).listen(smtpPort, "127.0.0.1");

createHttp((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(req.url === "/mails" ? JSON.stringify(mails) : '{"ok":true}');
}).listen(httpPort, "127.0.0.1");
