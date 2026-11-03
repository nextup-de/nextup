// Policies, including the superseded 2022 versions (stale on purpose), and the 'Wer entscheidet was' pages.
import type { PackFile } from "../manifest";
import type { Rng } from "../../musterwerk/rng";
import { musterwerkStructure } from "../../musterwerk/structure";
import { m365 } from "./util";

export function policyFiles(): PackFile[] {
  const c = (name: string, title: string, body: string, year: number, extra: Partial<Parameters<typeof m365>[0]> = {}) =>
    m365({ site: "Company", folders: "Richtlinien", name, title, body, year, kind: "policy", ...extra });
  return [
    c("Beschaffungsrichtlinie 2026", "Beschaffungsrichtlinie 2026",
      "# Beschaffungsrichtlinie 2026\n\nGültig ab 1. Januar 2026. Ersetzt die Beschaffungsrichtlinie 2022.\n\n## Genehmigungsgrenzen\n\n- Bestellungen bis 5.000 EUR je Vorgang gibt die Bereichsleitung frei.\n- Darüber bis 25.000 EUR die Werkleitung beziehungsweise die Leitung Finanzen.\n- Über 25.000 EUR die Geschäftsführung.\n\n## Grundsätze\n\nMindestens zwei Angebote ab 2.500 EUR, Rahmenverträge haben Vorrang, Bestellungen ohne Bestellanforderung sind zu begründen. Aufspaltung von Bestellungen zur Umgehung der Grenze ist untersagt.\n", 2026),
    c("Beschaffungsrichtlinie 2022", "Beschaffungsrichtlinie 2022 (ersetzt)",
      "# Beschaffungsrichtlinie 2022\n\nHinweis: Diese Richtlinie wurde durch die Fassung 2026 ersetzt und gilt nicht mehr.\n\n## Genehmigungsgrenzen\n\n- Bestellungen bis 2.500 EUR je Vorgang gibt die Bereichsleitung frei.\n- Darüber bis 15.000 EUR die Werkleitung.\n- Über 15.000 EUR die Geschäftsführung.\n\nMindestens zwei Angebote ab 1.000 EUR.\n", 2022),
    c("Procurement Policy 2026", "Procurement Policy 2026 (English summary)",
      "# Procurement policy 2026 – summary\n\nOrders up to EUR 5,000 are approved by the head of department, up to EUR 25,000 by the plant manager or the head of finance, above that by the managing director. Two quotes are required from EUR 2,500. Splitting orders to stay below a limit is not allowed.\n", 2026, { lang: "en" }),
    c("Reisekostenrichtlinie 2026", "Reisekostenrichtlinie 2026",
      "# Reisekostenrichtlinie 2026\n\n- Bahnreisen in der 2. Klasse; Flüge nur, wenn die Bahnfahrt länger als 6 Stunden dauert.\n- Hotel bis 120 EUR je Nacht, in Großstädten bis 150 EUR.\n- Verpflegungspauschale nach gesetzlichen Sätzen.\n- Reiseabrechnung innerhalb von 30 Tagen im Personalportal; Belege über 50 EUR sind beizufügen.\n- Dienstreisen außerhalb Europas genehmigt die Geschäftsführung.\n", 2026),
    c("Reisekostenrichtlinie 2021", "Reisekostenrichtlinie 2021 (ersetzt)",
      "# Reisekostenrichtlinie 2021\n\nHinweis: ersetzt durch die Fassung 2026.\n\n- Hotel bis 100 EUR je Nacht.\n- Reiseabrechnung innerhalb von 14 Tagen per Formular.\n", 2021),
    c("Travel Expense Policy", "Travel expense policy",
      "# Travel expense policy\n\nTravel by train in second class. Hotels up to EUR 120 per night. Submit your expense report within 30 days in the HR portal and attach receipts above EUR 50.\n", 2026, { lang: "en" }),
    c("Arbeitssicherheit", "Arbeitssicherheit: Grundregeln",
      "# Arbeitssicherheit – Grundregeln\n\n- Persönliche Schutzausrüstung (Sicherheitsschuhe, Gehörschutz, Schutzbrille) ist im Produktionsbereich Pflicht.\n- Schutzeinrichtungen an Maschinen dürfen nie überbrückt werden.\n- Unfälle und Beinaheunfälle werden noch in der Schicht der Fachkraft für Arbeitssicherheit gemeldet.\n- Unterweisung einmal jährlich; die Teilnahme wird dokumentiert.\n- Bei Gefahr gilt: Anlage stoppen, Bereich sichern, Schichtleiter rufen.\n", 2025),
    c("Überstundenregelung", "Überstundenregelung",
      "# Überstundenregelung\n\nÜberstunden werden von der Führungskraft vorab angeordnet. Sie werden im Zeitkonto erfasst und innerhalb von 6 Monaten durch Freizeit ausgeglichen. Mehr als 10 Stunden Arbeitszeit am Tag sind nicht zulässig. Der Betriebsrat wird bei dauerhaften Überstunden in einer Schicht beteiligt. Auszahlung nur nach Zustimmung der Personalabteilung.\n", 2024),
    c("Überstundenregelung 2020", "Überstundenregelung (alt)",
      "# Überstundenregelung\n\nHinweis: alter Stand. Ausgleich innerhalb von 12 Monaten, Auszahlung auf Antrag der Führungskraft.\n", 2020),
    c("Datenschutz-Merkblatt", "Datenschutz-Merkblatt",
      "# Datenschutz-Merkblatt\n\nPersonenbezogene Daten werden nur für den vorgesehenen Zweck verarbeitet. Daten von Beschäftigten (Gehalt, Fehlzeiten, Bewerbungen) liegen ausschließlich im Bereich Personal. Eine Weitergabe an Dritte braucht die Zustimmung der Datenschutzbeauftragten. Pannen werden sofort gemeldet; die Meldefrist an die Aufsichtsbehörde beträgt 72 Stunden.\n", 2025),
  ];
}

/** 'Wer entscheidet was' mirrors the routes of TST's structure: one page, plus one page per route. */
export function decisionFiles(rng: Rng): PackFile[] {
  const k = musterwerkStructure(rng.fork("structure"), 60);
  const title = (id: string | null) => k.roles.find((r) => r.id === id)?.title ?? "offen";
  const rows = k.rules.map((r) => ({ key: r.key, type: r.type, kw: r.keywords.join(", "), owner: title(r.ownerRoleId), deputy: title(r.deputyRoleId), wait: r.wait }));
  const out: PackFile[] = [
    m365({
      site: "Company", folders: "Orientierung", name: "Wer entscheidet was", title: "Wer entscheidet was", kind: "routes", year: 2026,
      body: `# Wer entscheidet was\n\nWenn etwas nicht läuft, geht die Meldung an die zuständige Stelle. Fällt sie aus, übernimmt die Vertretung.\n\n| Thema | Stichworte | Zuständig | Vertretung |\n|---|---|---|---|\n${rows.map((r) => `| ${r.type} | ${r.kw} | ${r.owner} | ${r.deputy} |`).join("\n")}\n\nBleibt eine Meldung länger als 5 Tage ohne Antwort, geht sie an die Vertretung.\n`,
    }),
  ];
  for (const r of rows) {
    out.push(m365({
      site: "Company", folders: "Orientierung/Zuständigkeiten", name: `Zuständigkeit ${r.key}`, title: `Zuständigkeit: ${r.type}`, kind: "routes", year: 2026,
      body: `# Zuständigkeit: ${r.type}\n\nZuständig: ${r.owner}\nVertretung: ${r.deputy}\nTypische Stichworte: ${r.kw}\nAntwortfrist, danach Eskalation: ${r.wait}\n`,
    }));
  }
  return out;
}
