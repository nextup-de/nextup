// Plan REM, REM-C1: the console and erasure copy say what the code does.
import { expect, it } from "vitest";
import { createT } from "@/i18n";

const en = createT("en");
const de = createT("de");

it("REM copy names the AI provider's agreement", () => {
  // The console row and field and the setup lines call the AI contract what the privacy settings call it.
  expect(en("adminPrivacy.rowDpa")).toBe("AI provider's agreement");
  expect(en("adminPrivacy.fieldDpa")).toContain("AI provider's agreement");
  expect(en("settingsSetupPhases.lineAiOn", { date: "1 Nov" })).toContain("AI provider's agreement");
  expect(en("settingsSetupPhases.lineAiNoAgreement")).toContain("AI provider's agreement");
  expect(de("adminPrivacy.rowDpa")).toBe("Vertrag mit dem KI-Anbieter");
  expect(de("adminPrivacy.fieldDpa")).toContain("Vertrag mit dem KI-Anbieter");
  expect(de("settingsSetupPhases.lineAiOn", { date: "1. Nov." })).toContain("Vertrag mit dem KI-Anbieter");
  expect(de("settingsSetupPhases.lineAiNoAgreement")).toContain("Vertrag mit dem KI-Anbieter");
  // The old name of it is gone from all of them.
  for (const text of [en("adminPrivacy.rowDpa"), en("adminPrivacy.fieldDpa"), en("settingsSetupPhases.lineAiOn", { date: "x" }), en("settingsSetupPhases.lineAiNoAgreement")]) expect(text).not.toMatch(/data-processing/i);
  for (const text of [de("adminPrivacy.rowDpa"), de("adminPrivacy.fieldDpa"), de("settingsSetupPhases.lineAiOn", { date: "x" }), de("settingsSetupPhases.lineAiNoAgreement")]) expect(text).not.toMatch(/Auftragsverarbeitung/);
});

it("REM copy directory line names the admin", () => {
  expect(en("settingsSetupPhases.lineDirectoryOff")).toBe("The directory sync is off. A stack admin or an Entra admin switches it on.");
  expect(de("settingsSetupPhases.lineDirectoryOff")).toBe("Der Verzeichnisabgleich ist aus. Ein Stack-Admin oder ein Entra-Admin schaltet ihn ein.");
  expect(en("settingsSetupPhases.lineDirectoryOff")).not.toContain("NextUp's team");
});

it("REM copy erasure reply names what stays", () => {
  for (const t of [en, de]) {
    const text = t("privacyPerson.replyText", { name: "Mara Keller" });
    expect(text).toContain("Mara Keller");
    expect(text).toMatch(/pseudonymi[sz]/i);
    expect(text).toMatch(/backups?/i);
    expect(text.split("\n\n").length).toBeGreaterThanOrEqual(3);
  }
  expect(en("privacyPerson.replyText", { name: "X" })).toContain("pseudonymised, without your name");
  expect(en("privacyPerson.replyText", { name: "X" })).toContain("until they age out");
  expect(de("privacyPerson.replyText", { name: "X" })).toContain("pseudonymisiert und ohne Ihren Namen");
  expect(de("privacyPerson.replyText", { name: "X" })).toContain("Backups behalten die alten Daten");
  for (const key of ["replyTitle", "replyHint", "replyCopy", "replyCopied"] as const) {
    expect(en(`privacyPerson.${key}`, { name: "X" })).not.toBe("");
    expect(de(`privacyPerson.${key}`, { name: "X" })).not.toBe("");
  }
});
