// Colleagues by name in what goes to the brain: "Herr Becker", "Frau Dr. Weber", "bei Herrn Schulz",
// "Mr. Novak" become "[Kollege]", "[Kollegin]" or "[a colleague]". The redaction (features/assist/redact)
// masks the names the company's directory knows; a surname alone after a form of address is not in it
// (AIT live run 2026-11-08: "Herr Becker" reached the model and came back in the coach's reply). The brain
// masks the same way again (services/brain/brain/guard.py) - one rule, written twice. Pure.
const CAP = "[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?";
const ADDRESSED = new RegExp(
  `(?<![\\p{L}])(Herrn?|Hr\\.|Frau|Fr\\.|Kollegen?|Kollegin|Mr\\.?|Mrs\\.?|Ms\\.?|Miss)\\s+(?:(?:Dr|Prof)\\.\\s*)?(${CAP}(?:\\s+${CAP})?)(?![\\p{L}])`,
  "gu",
);
const FEMALE = new Set(["Frau", "Fr.", "Kollegin", "Mrs", "Mrs.", "Ms", "Ms.", "Miss"]);
const ENGLISH = new Set(["Mr", "Mr.", "Mrs", "Mrs.", "Ms", "Ms.", "Miss"]);
// "Kollege Schichtleiter" is a role, "Herr der Lage" no name at all.
const NOT_A_NAME = new Set(["Schichtleiter", "Schichtführer", "Meister", "Vorarbeiter", "Teamleiter", "Leiter", "Am", "Im", "Aus", "Von", "Vom", "Der", "Die", "Das"]);

export function maskAddressed(text: string): string {
  return text.replace(ADDRESSED, (whole, title: string, name: string) => {
    if (NOT_A_NAME.has(name.split(/\s+/)[0])) return whole;
    return ENGLISH.has(title) ? "[a colleague]" : FEMALE.has(title) ? "[Kollegin]" : "[Kollege]";
  });
}
