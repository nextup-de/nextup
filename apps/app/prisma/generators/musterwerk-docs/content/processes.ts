// Process descriptions per site: Schichtübergabe, Wareneingang, Reklamation/8D, Instandhaltung,
// Freigabe von Werkzeugänderungen, IT-Zugang, Urlaubsantrag.
import type { PackFile } from "../manifest";
import type { Rng } from "../../musterwerk/rng";
import { m365 } from "./util";

type Step = readonly string[];

const PLANT_PROCESSES: readonly { key: string; title: string; folder: string; steps: (w: string, r: Rng) => Step; owner: (w: string) => string }[] = [
  {
    key: "Schichtübergabe", title: "Schichtübergabe", folder: "Produktion/Prozesse",
    owner: (w) => `Schichtleiter ${w}`,
    steps: (w, r) => [
      `Die abgehende Schicht füllt das Übergabeprotokoll spätestens ${r.pick([10, 15, 20])} Minuten vor Schichtende aus.`,
      "Offene Störungen, Ausschuss über der Warnschwelle und gesperrte Chargen stehen an erster Stelle.",
      `Die Übergabe findet am Linienstand statt, nicht im Büro. Beide Schichtleiter von ${w} zeichnen gegen.`,
      "Fehlt ein Gegenzeichen, bleibt die abgehende Schicht verantwortlich, bis die Übergabe erfolgt ist.",
      "Sicherheitsrelevante Vorfälle werden zusätzlich sofort an die Fachkraft für Arbeitssicherheit gemeldet.",
    ],
  },
  {
    key: "Wareneingang", title: "Wareneingang", folder: "Logistik/Prozesse",
    owner: (w) => `Leiter Logistik ${w}`,
    steps: (_w, r) => [
      "Der Lieferschein wird mit der Bestellung im ERP abgeglichen. Abweichungen über 2 % der Menge gehen an den Einkauf.",
      `Wareneingangsprüfung nach Prüfplan: bei Erstlieferungen ${r.pick([5, 8, 10])} Teile, bei Serienlieferungen Stichprobe nach AQL.`,
      "Beschädigte Ware wird fotografiert und mit gelbem Sperrschein ins Sperrlager gestellt.",
      "Die Buchung erfolgt erst nach Freigabe durch die Qualität; bis dahin gilt die Ware als nicht verfügbar.",
      "Gefahrstoffe werden nur über die Rampe 3 angenommen und sofort in das Gefahrstofflager gebracht.",
    ],
  },
  {
    key: "Reklamation und 8D", title: "Reklamation und 8D-Report", folder: "Qualität/Prozesse",
    owner: (w) => `Leiter Qualität ${w}`,
    steps: (_w, r) => [
      "Jede Kundenreklamation wird innerhalb von 24 Stunden im Qualitätssystem erfasst und mit einer Nummer versehen.",
      "Sofortmaßnahme (D3): betroffene Lagerbestände sperren, Kunden informieren, Sortierprüfung einleiten.",
      `Ein 8D-Report ist Pflicht ab ${r.pick([3, 5])} gleichartigen Reklamationen im Quartal oder bei jeder Sicherheitsreklamation.`,
      "Ursachenanalyse (D4/D5) mit Ishikawa und 5-Why; die Wirksamkeit der Abstellmaßnahme wird nach 90 Tagen geprüft (D8).",
      "Der Abschluss braucht die Unterschrift des Leiters Qualität; bei Sicherheitsreklamationen zusätzlich der Werkleitung.",
    ],
  },
  {
    key: "Instandhaltung", title: "Instandhaltung und Störungsmeldung", folder: "Instandhaltung/Prozesse",
    owner: (w) => `Leiter Instandhaltung ${w}`,
    steps: (_w, r) => [
      "Störungen werden über die Störmeldung am Linienterminal erfasst, nicht telefonisch.",
      `Reaktionszeit der Instandhaltung: Priorität 1 (Linienstillstand) ${r.pick([10, 15])} Minuten, Priorität 2 innerhalb der Schicht.`,
      "Reparaturen über 2.000 EUR Ersatzteilwert brauchen eine Freigabe des Leiters Instandhaltung.",
      "Nach jeder Reparatur trägt die Instandhaltung Ursache und Dauer ein; die Daten fließen in die Stillstandsstatistik.",
      "Vorbeugende Wartung folgt dem Wartungsplan je Linie; verschobene Termine müssen begründet werden.",
    ],
  },
  {
    key: "Freigabe Werkzeugänderung", title: "Freigabe von Werkzeugänderungen", folder: "Entwicklung/Prozesse",
    owner: () => "Leiter Entwicklung Werk Süd",
    steps: () => [
      "Eine Werkzeugänderung wird mit Zeichnungsstand, Grund und betroffenen Artikeln beantragt.",
      "Die Entwicklung bewertet die Änderung, die Qualität legt fest, ob eine Erstbemusterung nötig ist.",
      "Änderungen mit Einfluss auf Kundenzeichnungen brauchen die schriftliche Zustimmung des Kunden vor dem Umbau.",
      "Das geänderte Werkzeug läuft erst nach Erstbemusterung und Freigabe durch die Qualität in Serie.",
      "Die Freigabe wird mit Datum und Zeichnungsindex in der Werkzeugakte vermerkt.",
    ],
  },
];

const COMMON: readonly { key: string; title: string; site: "Company" | "Zentrale"; folder: string; lines: readonly string[] }[] = [
  {
    key: "IT-Zugang", title: "IT-Zugang beantragen", site: "Company", folder: "Prozesse",
    lines: [
      "Neue Zugänge werden über das IT-Ticketsystem beantragt. Die Führungskraft bestätigt den Antrag.",
      "Standardzugänge (E-Mail, Intranet, ERP-Lesezugriff) sind in der Regel nach 2 Arbeitstagen eingerichtet.",
      "Für Schreibrechte im ERP und Zugriff auf HR- oder Finanzlaufwerke ist zusätzlich die Freigabe der Bereichsleitung nötig.",
      "Beim Austritt entzieht die IT alle Zugänge am letzten Arbeitstag; die Personalabteilung löst das Ticket aus.",
      "Passwörter werden nie weitergegeben. Das Zurücksetzen läuft über den Selbstservice oder den IT-Helpdesk.",
    ],
  },
  {
    key: "Urlaubsantrag", title: "Urlaubsantrag", site: "Company", folder: "Prozesse",
    lines: [
      "Urlaub wird im Personalportal beantragt, bei Schichtmitarbeitenden mindestens 4 Wochen vor Beginn.",
      "Die Führungskraft entscheidet innerhalb von 5 Arbeitstagen; ohne Antwort wird der Antrag an die Personalabteilung eskaliert.",
      "Mehr als 10 zusammenhängende Arbeitstage in den Sommerferien werden nach Betriebsplanung vergeben.",
      "Resturlaub aus dem Vorjahr verfällt am 31. März, sofern nicht krankheitsbedingt übertragen.",
      "Sonderurlaub (Hochzeit, Umzug, Todesfall) beantragen Sie formlos bei der Personalabteilung.",
    ],
  },
  {
    key: "Freigabe Beschaffung", title: "Freigabe von Bestellungen", site: "Zentrale", folder: "Einkauf/Prozesse",
    lines: [
      "Bestellanforderungen werden im ERP erfasst; der Einkauf prüft Lieferant, Preis und Rahmenvertrag.",
      "Bis zum Limit der Beschaffungsrichtlinie gibt die Bereichsleitung frei, darüber die Geschäftsführung.",
      "Eilbestellungen ohne Bestellanforderung sind die Ausnahme und werden nachträglich dokumentiert.",
      "Investitionen über 50.000 EUR laufen über den Investitionsantrag der Finanzabteilung.",
    ],
  },
  {
    key: "Urlaubsvertretung Zentrale", title: "Urlaubsvertretung in der Zentrale", site: "Zentrale", folder: "Prozesse",
    lines: [
      "Jede Abteilung der Zentrale benennt für die Urlaubszeit eine Vertretung mit Zugriff auf das Abteilungspostfach.",
      "Die Vertretung wird im Kalender eingetragen und der IT für Weiterleitungen gemeldet.",
    ],
  },
];

function render(title: string, owner: string, steps: Step): string {
  return `# ${title}\n\nVerantwortlich: ${owner}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`;
}

export function processFiles(rng: Rng): PackFile[] {
  const out: PackFile[] = [];
  for (const w of ["Werk Nord", "Werk Süd"] as const) {
    const r = rng.fork(w);
    for (const p of PLANT_PROCESSES) {
      out.push(m365({
        site: w, folders: p.folder, name: `Prozess ${p.key} ${w}`, title: `${p.title} (${w})`,
        body: render(`${p.title} – ${w}`, p.owner(w), p.steps(w, r)),
        year: r.pick([2024, 2025, 2025, 2026]), kind: "process",
      }));
    }
  }
  for (const c of COMMON) {
    out.push(m365({
      site: c.site, folders: c.folder, name: `Prozess ${c.key}`, title: c.title,
      body: render(c.title, "Personal und IT", c.lines), year: 2025, kind: "process",
    }));
  }
  // The same process in English, for the colleagues who do not read German.
  out.push(m365({
    site: "Company", folders: "Prozesse/English", name: "Process IT access request", title: "How to request IT access", lang: "en",
    body: "# How to request IT access\n\n1. Open a ticket in the IT ticket system; your manager confirms it.\n2. Standard access (e-mail, intranet, read-only ERP) is set up within 2 working days.\n3. Write access to the ERP or to HR and finance drives needs the approval of the department head.\n4. On the last working day HR triggers the ticket that removes all access.\n",
    year: 2025, kind: "process",
  }));
  out.push(m365({
    site: "Company", folders: "Prozesse/English", name: "Process Leave request", title: "How to request leave", lang: "en",
    body: "# How to request leave\n\nRequest leave in the HR portal at least 4 weeks ahead if you work in shifts. Your manager decides within 5 working days. Unused leave from last year expires on 31 March.\n",
    year: 2025, kind: "process",
  }));
  return out;
}
