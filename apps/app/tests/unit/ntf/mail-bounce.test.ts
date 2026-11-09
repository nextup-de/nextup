// Bounces at the relay (NTF, G12): what the mail channel tells delivery when the relay answers RCPT TO with a
// permanent 5xx (a hard bounce: the address does not exist, so retrying cannot help) or a temporary 4xx (a soft
// bounce: mailbox full, greylisting; the retry ladder in server/notify/deliver.ts is for these). Real nodemailer
// against a local fake relay; nothing leaves the machine.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { NotifyMessage } from "@nextup/contracts/public";
import { mailChannel } from "@/server/notify/channels/mail";
import { sendMail } from "@/server/mail";
import { startFakeSmtp, type FakeSmtp } from "../../fixtures/smtp/fake-smtp";

const ANSWERS: Record<string, string> = {
  "gone@x.test": "550 5.1.1 <gone@x.test>: Recipient address rejected: User unknown",
  "full@x.test": "452 4.2.2 Mailbox full",
  "grey@x.test": "451 4.7.1 Greylisted, try again later",
};

let smtp: FakeSmtp;
const saved = process.env.SMTP_URL;
beforeAll(async () => {
  smtp = await startFakeSmtp((to) => ANSWERS[to] ?? "250 2.1.5 OK");
  process.env.SMTP_URL = smtp.url;
});
afterEach(() => {
  smtp.rcpts.length = 0;
});
afterAll(async () => {
  if (saved === undefined) delete process.env.SMTP_URL;
  else process.env.SMTP_URL = saved;
  await smtp.close();
});

const message = (address: string): NotifyMessage => ({
  id: "m1", companyId: "co1", recipient: { userId: "u1", address }, template: "reminder.deadline", locale: "en",
  subject: "Due", text: "The answer is due.", link: null, data: {},
});

describe("mail bounces at the relay", () => {
  it("a delivered mail is ok", async () => {
    expect(await sendMail({ to: "ok@x.test", subject: "s", text: "t" })).toEqual({ ok: true });
    expect(await mailChannel.send(message("ok@x.test"))).toMatchObject({ ok: true });
  });

  it("a hard bounce (5xx on RCPT TO) is not retryable, and says so with the relay's words", async () => {
    const r = await sendMail({ to: "gone@x.test", subject: "s", text: "t" });
    expect(r).toMatchObject({ ok: false, permanent: true });
    expect(!r.ok && r.error).toMatch(/^Hard bounce: .*550 5\.1\.1/);
    const sent = await mailChannel.send(message("gone@x.test"));
    expect(sent).toMatchObject({ ok: false, retryable: false });
    expect(!sent.ok && sent.error).toMatch(/User unknown/);
  });

  it("a soft bounce (4xx: mailbox full, greylisting) stays retryable", async () => {
    for (const to of ["full@x.test", "grey@x.test"]) {
      const r = await sendMail({ to, subject: "s", text: "t" });
      expect(r).toMatchObject({ ok: false, permanent: false });
      expect(!r.ok && r.error).toMatch(/^The mail server did not take it: .*45[12] /);
      expect(await mailChannel.send(message(to))).toMatchObject({ ok: false, retryable: true });
    }
  });

  it("a relay that is not there is retryable, not a bounce", async () => {
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    try {
      expect(await sendMail({ to: "ok@x.test", subject: "s", text: "t" }, 500)).toMatchObject({ ok: false, permanent: false });
      expect(await mailChannel.send(message("ok@x.test"))).toMatchObject({ ok: false, retryable: true });
    } finally {
      process.env.SMTP_URL = smtp.url;
    }
  });
});
