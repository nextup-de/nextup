import { describe, expect, it } from "vitest";
import { Locale as LocaleSchema } from "@nextup/contracts/public";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { defineMessages } from "@/i18n/define";
import { DATE_OPTIONS, days, formatDate, formatEuro, formatNumber, plural } from "@/i18n/format";
import {
  createT,
  DEFAULT_LOCALE,
  INTL_LOCALE,
  isLocale,
  LOCALES,
  resolveLocale,
  resolveRecipientLocale,
  translate,
  type MessageKey,
} from "@/i18n";

const NAMESPACES = ["common", "errors", "shell", "auth", "profile", "settings", "report", "demo", "dashboard", "team", "leader", "ideas", "projects", "cases", "mail", "structure", "connectors", "settingsCompany", "settingsOrg", "settingsGoals", "settingsConnectors", "settingsNotifications", "settingsPrivacy", "settingsAudit", "privacyExport", "privacyPerson", "settingsSetup", "adminAccess", "adminConsole", "adminConnectors", "adminPrivacy", "adminSupport", "loopCase", "decisions", "metrics", "kpis", "people", "feed", "overview", "progress", "settingsAreas", "floorDevices", "floor", "settingsApiTokens", "settingsWebhooks", "settingsImport", "teams", "settingsTeams", "settingsSignIn", "ssoLogin"];
const flat = (s: string) => s.replace(/[  ]/g, " ");

describe("LNG catalog core", () => {
  it("replaces placeholders", () => {
    expect(translate("en", "errors.notFoundBack", { site: "NextUp" })).toBe("Back to NextUp");
    expect(translate("de", "errors.notFoundBack", { site: "NextUp" })).toBe("Zurück zu NextUp");
    expect(createT("en")("errors.reference", { digest: "abc" })).toBe("Reference abc");
  });

  it("picks plural forms by count in both locales", () => {
    expect(translate("en", "common.days", { count: 1 })).toBe("1 day");
    expect(translate("en", "common.days", { count: 2 })).toBe("2 days");
    expect(translate("de", "common.days", { count: 1 })).toBe("1 Tag");
    expect(translate("de", "common.days", { count: 2 })).toBe("2 Tage");
    expect(days("de", 3)).toBe("3 Tage");
    expect(plural("en", 1, "common.yes", "common.no")).toBe("1 Yes");
    expect(plural("en", 2, "common.yes", "common.no")).toBe("2 No");
  });

  it("returns the key when it is missing at run time", () => {
    expect(translate("en", "common.nope" as MessageKey)).toBe("common.nope");
    expect(translate("de", "nope.nope" as MessageKey)).toBe("nope.nope");
  });

  it("has every namespace in en and de with the same keys", () => {
    expect(Object.keys(en)).toEqual(NAMESPACES);
    expect(Object.keys(de)).toEqual(NAMESPACES);
    for (const ns of NAMESPACES) {
      const k = ns as keyof typeof en;
      expect(Object.keys(de[k]).sort(), ns).toEqual(Object.keys(en[k]).sort());
    }
  });

  it("has the locales of the contract", () => {
    expect([...LOCALES]).toEqual(LocaleSchema.options);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isLocale("de")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("formats dates in Europe/Berlin per locale", () => {
    const iso = "2026-11-05T10:00:00Z";
    const d = new Date(iso);
    expect(formatDate("en", iso, "dayMonth")).toBe("5 Nov");
    expect(formatDate("de", iso, "dayMonth")).toBe("5. Nov.");
    expect(formatDate("en", iso, "full")).toBe("5 November 2026");
    expect(formatDate("de", iso, "full")).toBe("5. November 2026");
    expect(formatDate("de", iso, "weekday")).toBe("Donnerstag");
    expect(formatDate("de", iso, "time")).toBe("11:00");
    for (const style of ["day", "dayMonth", "full", "weekday"] as const) {
      expect(formatDate("en", iso, style)).toBe(d.toLocaleDateString("en-GB", DATE_OPTIONS[style]));
      expect(formatDate("en", d, style)).toBe(formatDate("en", iso, style));
    }
    for (const style of ["time", "dateTime"] as const) {
      expect(formatDate("en", iso, style)).toBe(d.toLocaleString("en-GB", DATE_OPTIONS[style]));
    }
    expect(formatDate("de", iso, "dateTime")).toBe(d.toLocaleString(INTL_LOCALE.de, DATE_OPTIONS.dateTime));
    expect(formatDate("de", iso, "day")).toBe(d.toLocaleDateString("de-DE", DATE_OPTIONS.day));
  });

  it("formats numbers and euros", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatNumber("de", 1234)).toBe("1.234");
    expect(flat(formatEuro("en", 5000))).toBe("€5,000");
    expect(flat(formatEuro("de", 5000))).toBe("5.000 €");
  });

  it("rejects a de with a missing or extra key", () => {
    // @ts-expect-error de lacks the key "b"
    defineMessages({ en: { a: "A", b: "B" }, de: { a: "A" } });
    // @ts-expect-error de has the key "c" that en does not have
    defineMessages({ en: { a: "A" }, de: { a: "A", c: "C" } });
    expect(defineMessages({ en: { a: "A" }, de: { a: "Ä" } }).de.a).toBe("Ä");
  });
});

describe("LNG locale resolution", () => {
  it("resolves a request: cookie, user, company, default", () => {
    expect(resolveLocale({ cookie: "de" })).toBe("de");
    expect(resolveLocale({ userLocale: "de" })).toBe("de");
    expect(resolveLocale({ companyLocale: "de" })).toBe("de");
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ cookie: null, userLocale: null, companyLocale: null })).toBe("en");
    expect(resolveLocale({ cookie: "fr", userLocale: "de" })).toBe("de");
    expect(resolveLocale({ cookie: "en", userLocale: "de", companyLocale: "de" })).toBe("en");
    expect(resolveLocale({ userLocale: "en", companyLocale: "de" })).toBe("en");
    expect(resolveLocale({ cookie: "xx", userLocale: "yy", companyLocale: "zz" })).toBe("en");
  });

  it("resolves a recipient: user, company, default", () => {
    expect(resolveRecipientLocale({ userLocale: "de" })).toBe("de");
    expect(resolveRecipientLocale({ companyLocale: "de" })).toBe("de");
    expect(resolveRecipientLocale({})).toBe("en");
    expect(resolveRecipientLocale({ userLocale: "fr", companyLocale: "de" })).toBe("de");
    expect(resolveRecipientLocale({ userLocale: "en", companyLocale: "de" })).toBe("en");
  });
});
