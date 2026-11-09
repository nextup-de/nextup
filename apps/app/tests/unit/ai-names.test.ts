import { describe, expect, it } from "vitest";
import { maskAddressed } from "@/features/ai/names";
import { redact } from "@/features/assist/redact";

describe("maskAddressed", () => {
  it.each([
    ["Herr Becker aus der Spätschicht kommt ständig zu spät", "[Kollege] aus der Spätschicht kommt ständig zu spät"],
    ["Bestellungen liegen bei Herrn Schulz im Einkauf", "Bestellungen liegen bei [Kollege] im Einkauf"],
    ["Frau Dr. Weber stellt die Gänge zu", "[Kollegin] stellt die Gänge zu"],
    ["Kollege Yilmaz und Herr Thomas Krause streiten", "[Kollege] und [Kollege] streiten"],
    ["Mr. Novak keeps skipping the checklist", "[a colleague] keeps skipping the checklist"],
  ])("masks %s", (text, masked) => {
    expect(maskAddressed(text)).toBe(masked);
  });

  it.each(["Herr der Lage bleiben", "Kollege Schichtleiter weiß es", "Fr. 12.3. ist Inventur", "Die Frauenquote steigt"])("leaves %s alone", (text) => {
    expect(maskAddressed(text)).toBe(text);
  });

  it("runs after the directory's names, so a full name keeps its role", () => {
    const r = redact("Herr Thomas Becker kommt zu spät", { people: [{ name: "Thomas Becker", role: "Schichtleiter" }] });
    expect(maskAddressed(r.text)).toBe("Herr [Schichtleiter] kommt zu spät");
  });
});
