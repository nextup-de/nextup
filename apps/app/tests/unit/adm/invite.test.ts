import { describe, expect, it } from "vitest";
import { inviteMail } from "@/features/auth/invite-mail";
import { companyLoginPath } from "@/features/auth/login-path";

const CODE = "acme-7f3k-92xd-q4mh";
const LOGIN = "https://nextup.example/acme/login";
const person = { name: "Mara Voss" };
const company = { name: "Acme GmbH", loginUrl: LOGIN };

describe("ADM invite mail", () => {
  it("is written in English and German", () => {
    const en = inviteMail(person, company, CODE, "en");
    const de = inviteMail(person, company, CODE, "de");
    expect(en.subject).toContain("Acme GmbH");
    expect(en.text).toContain("Hello Mara Voss");
    expect(de.subject).toContain("Acme GmbH");
    expect(de.text).toContain("Hallo Mara Voss");
    expect(de.text).not.toBe(en.text);
  });

  it("carries the code in the body", () => {
    for (const locale of ["en", "de"] as const) {
      const m = inviteMail(person, company, CODE, locale);
      expect(m.text).toContain(CODE);
      expect(m.subject).not.toContain(CODE);
    }
  });

  it("names only the login address, and no URL contains the code", () => {
    for (const locale of ["en", "de"] as const) {
      const urls = inviteMail(person, company, CODE, locale).text.match(/https?:\/\/\S+/g) ?? [];
      expect(urls).toEqual([LOGIN]);
      for (const u of urls) expect(u).not.toContain(CODE);
    }
  });
});

describe("ADM retired auth pages", () => {
  it("send a plausible company slug to its login and everything else to find-company", () => {
    expect(companyLoginPath("acme")).toMatch(/acme.*\/login$/);
    expect(companyLoginPath(undefined)).toBe("/login");
    expect(companyLoginPath("//evil.com")).toBe("/login");
  });
});
