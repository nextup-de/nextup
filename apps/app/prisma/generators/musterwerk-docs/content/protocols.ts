// The everyday files of the plants and the Zentrale: shift protocols, 8D reports, maintenance plans,
// meeting notes, supplier ratings, IT how-tos. Most are noise; some years are stale on purpose.
import type { PackFile } from "../manifest";
import type { Rng } from "../../musterwerk/rng";
import { m365, pad } from "./util";

const WERKE = ["Werk Nord", "Werk Süd"] as const;
const LINES = ["Linie A", "Linie B"] as const;
const DEFECTS = ["Grat an der Dichtfläche", "Maßabweichung Bohrung", "Lunker im Gussteil", "Kratzer an der Sichtfläche", "Rissbildung nach dem Biegen", "Falsche Etikettierung"];
const CAUSES = ["Werkzeugverschleiß", "Materialcharge außerhalb der Toleranz", "falsche Maschineneinstellung nach Rüstvorgang", "Bedienfehler bei der Schichtübergabe", "Temperaturabweichung im Werkzeug"];
const FAULTS = ["Hydraulikleck an der Presse", "Sensorausfall Lichtschranke", "Förderband blockiert", "Kühlwasserpumpe defekt", "Werkzeugbruch", "Steuerung meldet Fehler 417"];

export function protocolFiles(rng: Rng): PackFile[] {
  const out: PackFile[] = [];
  for (const w of WERKE) {
    const r = rng.fork(`proto-${w}`);
    for (let i = 0; i < 24; i++) {
      const year = i < 8 ? r.pick([2021, 2022]) : r.pick([2025, 2026]);
      const kw = pad(r.int(1, 52));
      const line = r.pick(LINES);
      const shift = r.pick(["Früh", "Spät", "Nacht"]);
      out.push(m365({
        site: w, folders: `Produktion/Schichtprotokolle/${year}`, name: `Schichtprotokoll ${line} KW${kw} ${shift} ${i}`,
        title: `Schichtprotokoll ${line} KW${kw} ${year} (${shift}schicht)`, year, kind: "shift-protocol",
        body: `# Schichtprotokoll ${w} – ${line}, KW ${kw}/${year}, ${shift}schicht\n\n- Stückzahl Soll/Ist: ${r.int(900, 1400)} / ${r.int(700, 1400)}\n- Ausschuss: ${r.int(5, 60)} Teile (${r.pick(DEFECTS)})\n- Rüstzeit: ${r.int(20, 95)} Minuten\n- Störung: ${r.pick(FAULTS)}, Stillstand ${r.int(5, 70)} Minuten\n- Offen für die nächste Schicht: ${r.pick(["Charge gesperrt, Qualität informiert", "Werkzeugwechsel um 06:00 geplant", "Wareneingang Material fehlt noch", "keine"])}\n`,
      }));
    }
    for (let i = 0; i < 12; i++) {
      const year = i < 4 ? r.pick([2021, 2022]) : r.pick([2024, 2025, 2026]);
      const nr = `${year}-${pad(i + 1, 3)}`;
      out.push(m365({
        site: w, folders: `Qualität/8D-Reports/${year}`, name: `8D-Report ${nr}`, title: `8D-Report ${nr}: ${r.pick(DEFECTS)}`, year, kind: "8d",
        body: `# 8D-Report ${nr} – ${w}\n\nD1 Team: Qualität, Produktion, Instandhaltung\nD2 Problem: ${r.pick(DEFECTS)}, ${r.int(20, 900)} Teile betroffen\nD3 Sofortmaßnahme: Lager gesperrt, Sortierprüfung\nD4 Ursache: ${r.pick(CAUSES)}\nD5 Abstellmaßnahme: Prüfplan ergänzt, Einstellblatt überarbeitet\nD6 Umsetzung: ${r.pick(["erledigt", "in Arbeit", "erledigt"])}\nD7 Vorbeugung: Schulung der Schichtleiter\nD8 Abschluss: ${r.pick(["Wirksamkeit bestätigt", "Wirksamkeitsprüfung offen"])}\n`,
      }));
    }
    for (const line of LINES) {
      for (const q of [1, 2, 3, 4]) {
        out.push(m365({
          site: w, folders: "Instandhaltung/Wartungspläne", name: `Wartungsplan ${line} Q${q}`, title: `Wartungsplan ${w} ${line} Quartal ${q}`, year: 2026, kind: "maintenance-plan",
          body: `# Wartungsplan ${w}, ${line}, Q${q} 2026\n\n- Presse: Hydrauliköl wechseln alle ${r.pick([1000, 1500])} Betriebsstunden\n- Förderband: Lager schmieren, Spannung prüfen\n- Lichtschranken reinigen und testen\n- Werkzeuge: Verschleißmessung, Dokumentation im Werkzeugbuch\n- Verantwortlich: Instandhaltung ${w}\n`,
        }));
      }
    }
  }

  const z = rng.fork("zentrale");
  for (let i = 0; i < 20; i++) {
    const year = i < 6 ? z.pick([2021, 2022]) : z.pick([2024, 2025, 2026]);
    const topic = z.pick(["Lieferengpass Aluminium", "Auslastung Werk Nord", "ERP-Update", "Audit Vorbereitung", "Energiekosten", "Ausbildung", "Umbau Halle 2"]);
    out.push(m365({
      site: "Zentrale", folders: `Jour fixe/${year}`, name: `Jour fixe ${year}-${pad(i + 1)} ${topic}`, title: `Jour fixe ${year}: ${topic}`, year, kind: "meeting",
      body: `# Jour fixe Zentrale ${year}, Termin ${i + 1}\n\nThema: ${topic}\n\n- Beschluss: ${z.pick(["Entscheidung vertagt", "Umsetzung bis Monatsende", "Einkauf prüft Alternativen", "IT stellt Ticket ein"])}\n- Verantwortlich: ${z.pick(["Leiter Einkauf Zentrale", "Leiter IT Zentrale", "Leiter Personal Zentrale", "Werkleiter Nord"])}\n- Nächster Termin in 14 Tagen\n`,
    }));
  }
  for (let i = 0; i < 8; i++) {
    out.push(m365({
      site: "Zentrale", folders: "Einkauf/Lieferantenbewertung", name: `Lieferantenbewertung L-${100 + i}`, title: `Lieferantenbewertung Lieferant L-${100 + i}`, year: z.pick([2022, 2025, 2026]), kind: "supplier-rating",
      body: `# Lieferantenbewertung L-${100 + i}\n\nTermintreue: ${z.int(78, 99)} %\nQualität (ppm): ${z.int(20, 900)}\nReklamationen im Jahr: ${z.int(0, 9)}\nGesamtnote: ${z.pick(["A", "B", "B", "C"])}\n`,
    }));
  }
  const howtos = ["VPN einrichten", "Drucker verbinden", "Passwort zurücksetzen", "Mehrfaktor-Anmeldung", "Besprechungsraum buchen", "Neues Notebook einrichten", "ERP-Zugang beantragen", "Phishing erkennen"];
  howtos.forEach((h, i) => out.push(m365({
    site: "Zentrale", folders: "IT/Anleitungen", name: `Anleitung ${h}`, title: `IT-Anleitung: ${h}`, year: i < 2 ? 2022 : 2025, kind: "howto",
    format: i % 4 === 0 ? "html" : "md",
    body: i % 4 === 0
      ? `<html><body>\n<h1>${h}</h1>\n<ol><li>Öffnen Sie das IT-Portal.</li><li>Wählen Sie „${h}“.</li><li>Bei Problemen: Helpdesk Tel. +49 000 1234-${100 + i}.</li></ol>\n</body></html>\n`
      : `# ${h}\n\n1. Öffnen Sie das IT-Portal.\n2. Wählen Sie „${h}“.\n3. Bei Problemen wenden Sie sich an den Helpdesk.\n`,
  })));
  return out;
}
