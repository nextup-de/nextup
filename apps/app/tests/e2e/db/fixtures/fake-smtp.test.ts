// The fake relay of the PIL acceptance answers what a mail check sends, and nothing else.
import { createConnection } from "node:net";
import { expect, test } from "@playwright/test";
import { startFakeSmtp } from "./fake-smtp";

/** Sends the lines (the last one must be QUIT) and returns everything the relay said. */
function talk(port: number, lines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    let said = "";
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("data", (chunk: string) => { said += chunk; });
    socket.on("close", () => resolve(said)); // the relay ends the connection after QUIT
    socket.on("connect", () => { for (const l of lines) socket.write(`${l}\r\n`); });
  });
}

test("the fake relay greets, answers EHLO and NOOP, and says bye on QUIT", async () => {
  const smtp = await startFakeSmtp(0);
  try {
    const said = await talk(smtp.port, ["EHLO test.local", "NOOP", "QUIT"]);
    expect(said.split("\r\n").filter(Boolean)).toEqual(["220 fake-smtp ready", "250 fake-smtp", "250 ok", "221 bye"]);
    expect(smtp.verbs).toEqual(["EHLO", "NOOP", "QUIT"]);
  } finally {
    await smtp.close();
  }
});

test("the fake relay takes no mail", async () => {
  const smtp = await startFakeSmtp(0);
  try {
    const said = await talk(smtp.port, ["EHLO test.local", "MAIL FROM:<a@b.test>", "QUIT"]);
    expect(said).toContain("502 not implemented");
    expect(said).not.toContain("354");
  } finally {
    await smtp.close();
  }
});

test("the fake relay stops listening on close", async () => {
  const smtp = await startFakeSmtp(0);
  const { port } = smtp;
  await smtp.close();
  await expect(talk(port, ["QUIT"])).rejects.toThrow(/ECONNREFUSED/);
});
