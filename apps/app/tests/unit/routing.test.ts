import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES as SEED_ROUTES } from "@/features/demo/seed";
import { keywordHits, keywordMatcher, propose, proposeRoute, ROUTER_VERSION } from "@/features/routing";

const ROUTES = [
  { id: "r1", keys: ["forklift", "shift"] },
  { id: "r8", keys: ["changeover", "mes", "sheet"] },
];

describe("proposeRoute", () => {
  it("picks the route with the most keyword hits", () => {
    expect(proposeRoute("The changeover sheet and MES ask for the same numbers", ROUTES)?.id).toBe("r8");
  });
  it("returns null when nothing matches", () => {
    expect(proposeRoute("hello", ROUTES)).toBeNull();
  });
  it("the first route wins a tie", () => {
    expect(proposeRoute("the shift and the sheet", ROUTES)?.id).toBe("r1");
  });
});

describe("a short keyword is a whole word", () => {
  const found = (text: string, key: string) => keywordMatcher(text)(key);

  it("'it' is not found inside German words, and is found as the word IT", () => {
    expect(found("Das dauert mit der Zeit immer länger, bitte prüfen", "it")).toBe(false);
    expect(found("Die IT hat den Zugang noch nicht eingerichtet", "it")).toBe(true);
    expect(found("Ask IT, please.", "it")).toBe(true);
  });
  it("the old spelling with a space behind it still works", () => {
    expect(found("Die IT hat den Zugang gesperrt", "it ")).toBe(true);
    expect(found("mit Zeit", "it ")).toBe(false);
  });
  it("'mes' and 'form' are not found in Messe, Information or Plattform", () => {
    expect(found("Auf der Messe gab es eine Information zur neuen Plattform", "mes")).toBe(false);
    expect(found("Auf der Messe gab es eine Information zur neuen Plattform", "form")).toBe(false);
    expect(found("The MES shows the wrong order", "mes")).toBe(true);
  });
  it("an English plural -s still counts", () => {
    expect(found("Two forms for the same job", "form")).toBe(true);
    expect(found("Spare parts are missing", "part")).toBe(true);
    expect(found("Our partner is late", "part")).toBe(false);
  });
  it("four letters are short, five are not", () => {
    expect(found("the deadline moved", "line")).toBe(false);
    expect(found("the paperwork doubled", "paper")).toBe(true);
  });
});

describe("a longer keyword is found inside German compounds", () => {
  const found = (text: string, key: string) => keywordMatcher(text)(key);

  it("at the start and at the end of a word", () => {
    expect(found("Der Werkzeugwechsel an Presse 2 dauert zu lange", "werkzeug")).toBe(true);
    expect(found("Das Messwerkzeug fehlt", "werkzeug")).toBe(true);
    expect(found("In der Spätschicht fehlt eine Person", "schicht")).toBe(true);
    expect(found("Der Schichtplan kommt zu spät", "schicht")).toBe(true);
  });
  it("a keyword of several words needs those words in a row", () => {
    expect(found("Das Teil liegt schon beim Kunden.", "beim kunden")).toBe(true);
    expect(found("Das dauert 30 Sekunden", "beim kunden")).toBe(false);
    expect(found("The change note is missing", "change note")).toBe(true);
    expect(found("Tier 1 supplier data", "tier-1")).toBe(true);
    expect(found("Tier-1 supplier data", "tier-1")).toBe(true);
  });
  it("a sign such as € is found anywhere", () => {
    expect(found("Ein Sensor für 300€", "€")).toBe(true);
    expect(found("Ein Sensor für 300 Euro", "€")).toBe(false);
  });
  it("an empty keyword finds nothing", () => {
    expect(found("anything", "")).toBe(false);
    expect(found("anything", "  ")).toBe(false);
  });
});

describe("umlauts and ß are folded on both sides", () => {
  const found = (text: string, key: string) => keywordMatcher(text)(key);

  it("the keyword with an umlaut finds the text without, and the other way round", () => {
    expect(found("Der Pruefstand ist belegt", "prüfstand")).toBe(true);
    expect(found("Der Prüfstand ist belegt", "pruefstand")).toBe(true);
    expect(found("DER PRÜFSTAND IST BELEGT", "Prüfstand")).toBe(true);
    expect(found("Das Gehäuse hat einen Riss", "gehaeuse")).toBe(true);
    expect(found("Überstunden am Samstag", "überstunden")).toBe(true);
  });
  it("ß and ss are the same", () => {
    expect(found("Zu viel Ausschuß an Linie 3", "ausschuss")).toBe(true);
    expect(found("Die Maße stimmen nicht", "masse")).toBe(true);
  });
});

describe("propose", () => {
  it("says nothing under 8 characters", () => {
    expect(propose("shift", ROUTES)).toBeNull();
  });
  it("no row: route null, confidence 0", () => {
    expect(propose("nothing here matches", ROUTES)).toEqual({ route: null, confidence: 0 });
  });
  it("confidence is 55 plus 14 per hit, capped at 96", () => {
    expect(propose("The changeover sheet and MES ask for the same numbers", ROUTES)).toEqual({ route: ROUTES[1], confidence: 96 }); // three hits: 97, capped
    expect(propose("the forklift is broken", ROUTES)?.confidence).toBe(69);
  });
  it("keywordHits lists the keywords found, in the order of the keys", () => {
    expect(keywordHits("MES and the changeover", ROUTES[1].keys)).toEqual(["changeover", "mes"]);
  });
});

describe("the acme routes in German", () => {
  const route = (text: string) => proposeRoute(text, SEED_ROUTES)?.id ?? null;

  it("routes plain German sentences a plant worker would write", () => {
    expect(route("Wir müssen neue Ersatzteile bestellen, der Lieferant braucht drei Wochen")).toBe("r1");
    expect(route("Der Prüfstand ist nächste Woche komplett ausgebucht, ich brauche eine Buchung für den Dauerlauf")).toBe("r2");
    expect(route("Zu viel Nacharbeit, die Toleranz wird nicht eingehalten")).toBe("r3");
    expect(route("Mein Passwort ist abgelaufen und ich habe keinen Zugriff mehr")).toBe("r4");
    expect(route("Die Nachtschicht macht seit Wochen Überstunden, uns fehlt Personal")).toBe("r6");
    expect(route("Die Vorrichtung an Linie 2 passt nicht zum neuen Werkzeug")).toBe("r7");
    expect(route("Wir füllen dasselbe Formular doppelt aus, einmal auf Papier")).toBe("r8");
  });
  it("a German sentence with 'mit' and 'Zeit' no longer lands on IT", () => {
    expect(route("Mit der Zeit wird das immer schlimmer")).toBeNull();
  });
});

// The eval set is scored by a Python copy of the matcher (services/brain/eval/run_eval.py). The recorded
// file holds that copy's answers, so this holds both matchers to the same result on every case.
describe("the Python mirror", () => {
  const dir = path.resolve(process.cwd(), "../../services/brain/eval");
  const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;
  const acme = read<{ baseline_keys: Record<string, string[]> }>("acme.json");
  const cases = read<{ id: string; lang: "de" | "en"; text: string; route_id: string | null }[]>("routing_cases.json");
  const recorded = read<{ model: string; answers: Record<string, string | null> }>("recorded/routing.json");
  const routes = Object.entries(acme.baseline_keys).map(([id, keys]) => ({ id, keys }));

  it("the eval's keywords are the acme seed's keywords", () => {
    expect(routes).toEqual(SEED_ROUTES.map((r) => ({ id: r.id, keys: r.keys })));
  });
  it("was recorded with this version", () => {
    expect(recorded.model).toBe(ROUTER_VERSION);
  });
  it("gives the recorded answer on every eval case", () => {
    const mine = Object.fromEntries(cases.map((c) => [c.id, proposeRoute(c.text, routes)?.id ?? null]));
    expect(mine).toEqual(recorded.answers);
  });
  it("is right more often than v1 was: German 27 of 34, English at least 43 of 58", () => {
    const right = (lang: "de" | "en") => cases.filter((c) => c.lang === lang && (proposeRoute(c.text, routes)?.id ?? null) === c.route_id).length;
    expect(right("de")).toBeGreaterThanOrEqual(27);
    expect(right("en")).toBeGreaterThanOrEqual(43);
  });
});
