// What an ERP or n8n would push: CSV extracts generated from the seed, each body at most 20,000 characters.
import type { PackFile } from "../manifest";
import type { Rng } from "../../musterwerk/rng";
import { api, chunkCsv, pad } from "./util";

const ARTICLES = ["Gehäuse G", "Halter H", "Deckel D", "Welle W", "Flansch F", "Winkel V", "Bügel B", "Buchse S"];
const MATERIALS = ["Aluminium 6082", "Stahl S235", "Edelstahl 1.4301", "Zinkdruckguss", "PA6-GF30", "Messing CW614N"];
const WERKE = ["Werk Nord", "Werk Süd"] as const;

function emit(out: PackFile[], kind: string, base: string, titleBase: string, header: string, rows: string[], year: number) {
  chunkCsv(header, rows).forEach((body, i, all) =>
    out.push(api({ kind, name: `${base}-${pad(i + 1)}`, title: all.length > 1 ? `${titleBase} (Teil ${i + 1} von ${all.length})` : titleBase, body, year })));
}

export function erpFiles(rng: Rng): PackFile[] {
  const out: PackFile[] = [];

  const o = rng.fork("orders");
  const orders: string[] = [];
  for (let i = 0; i < 900; i++) {
    orders.push([`A-${2026}${pad(i + 1, 5)}`, `K-${o.int(10, 40)}`, o.pick(ARTICLES), o.int(100, 20000), `2026-${pad(o.int(1, 10))}-${pad(o.int(1, 28))}`, o.pick(["offen", "in Fertigung", "geliefert", "geliefert", "storniert"]), o.pick(WERKE)].join(";"));
  }
  emit(out, "orders", "Auftraege-2026", "ERP-Auftragsliste 2026", "Auftrag;Kunde;Artikel;Menge;Liefertermin;Status;Werk", orders, 2026);

  const s = rng.fork("stock");
  const stock = MATERIALS.flatMap((m, mi) => WERKE.map((w) => [`M-${100 + mi}`, m, w, s.int(200, 40000), s.int(500, 5000), s.pick(["kg", "Stück", "kg"]), s.pick(["Lager 1", "Lager 2", "Sperrlager"])].join(";")));
  const parts = ARTICLES.flatMap((a, ai) => WERKE.map((w) => [`T-${200 + ai}`, a, w, s.int(0, 15000), s.int(500, 3000), "Stück", "Fertigwarenlager"].join(";")));
  emit(out, "stock", "Bestand-2026", "ERP-Lagerbestand Material und Fertigteile", "Nr;Bezeichnung;Werk;Bestand;Mindestbestand;Einheit;Lagerort", [...stock, ...parts], 2026);

  const u = rng.fork("suppliers");
  const suppliers: string[] = [];
  for (let i = 0; i < 40; i++) suppliers.push([`L-${100 + i}`, `Lieferant ${100 + i} GmbH`, u.pick(MATERIALS), u.pick(["30 Tage", "45 Tage", "60 Tage"]), `${u.int(78, 99)} %`, u.pick(["aktiv", "aktiv", "gesperrt"])].join(";"));
  emit(out, "suppliers", "Lieferanten", "ERP-Lieferantenstamm", "Nr;Name;Hauptmaterial;Zahlungsziel;Termintreue;Status", suppliers, 2026);

  const c = rng.fork("costcentres");
  const cc: string[] = [];
  for (const [k, n] of [["1100", "Produktion Linie A Werk Nord"], ["1110", "Produktion Linie B Werk Nord"], ["1200", "Produktion Linie A Werk Süd"], ["1210", "Produktion Linie B Werk Süd"], ["2000", "Qualität"], ["2100", "Instandhaltung"], ["3000", "Logistik"], ["4000", "Einkauf"], ["4100", "IT"], ["4200", "Personal"], ["4300", "Finanzen"], ["5000", "Entwicklung"]] as const) {
    cc.push([k, n, 2025, c.int(80, 900) * 1000, c.int(80, 900) * 1000].join(";"));
    cc.push([k, n, 2026, c.int(80, 900) * 1000, c.int(40, 700) * 1000].join(";"));
  }
  emit(out, "cost-centres", "Kostenstellen", "ERP-Kostenstellen mit Budget und Ist (EUR)", "Kostenstelle;Bezeichnung;Jahr;Budget EUR;Ist EUR", cc, 2026);

  const d = rng.fork("downtime");
  for (const w of WERKE) {
    for (const line of ["Linie A", "Linie B"]) {
      const rows: string[] = [];
      for (let i = 0; i < 260; i++) rows.push([`2026-${pad(d.int(1, 10))}-${pad(d.int(1, 28))}`, w, line, d.pick(["Früh", "Spät", "Nacht"]), d.int(5, 180), d.pick(["Hydraulik", "Sensorik", "Werkzeugwechsel", "Materialmangel", "Rüsten", "Steuerung"])].join(";"));
      emit(out, "downtime", `Stillstand-${w.replace(" ", "-")}-${line.replace(" ", "-")}`, `Stillstände ${w} ${line} 2026`, "Datum;Werk;Linie;Schicht;Minuten;Ursache", rows, 2026);
    }
  }

  const sc = rng.fork("scrap");
  for (const w of WERKE) {
    const rows: string[] = [];
    for (let m = 1; m <= 10; m++) for (let day = 1; day <= 28; day += 3) for (const shift of ["Früh", "Spät", "Nacht"]) {
      const made = sc.int(900, 1500);
      rows.push([`2026-${pad(m)}-${pad(day)}`, w, shift, made, sc.int(4, 70), sc.pick(["Grat", "Maß", "Lunker", "Kratzer", "Riss"])].join(";"));
    }
    emit(out, "scrap", `Ausschuss-${w.replace(" ", "-")}`, `Ausschuss je Schicht ${w} 2026`, "Datum;Werk;Schicht;Gefertigt;Ausschuss;Hauptfehler", rows, 2026);
  }
  return out;
}
