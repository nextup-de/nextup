// The ideas Musterwerk's people raise day by day (life.ts), per route of the generated structure. Each idea carries the
// project it becomes after a yes: a measure a plant would really track, a believable baseline, the better direction and the
// four steps a team would plan. German, as the company is. A route the catalogue does not know draws from GENERAL.

export type LifeProject = {
  metric: string; unit: string; base: readonly [number, number]; better: "up" | "down";
  /** The share the measure moves by when the project worked, e.g. 0.3 = 30 % better. */
  gain: number;
  steps: readonly [string, string, string, string];
};
export type LifeIdea = { title: string; body: string; upside: string; project: LifeProject };

const idea = (title: string, body: string, upside: string, project: LifeProject): LifeIdea => ({ title, body, upside, project });
const p = (metric: string, unit: string, base: readonly [number, number], better: "up" | "down", gain: number, steps: LifeProject["steps"]): LifeProject =>
  ({ metric, unit, base, better, gain, steps });

export const LIFE_IDEAS: Record<string, readonly LifeIdea[]> = {
  maintenance: [
    idea("Schwingungssensoren an den Pressen", "An Presse 2 und 4 kündigen sich Lagerschäden oft Tage vorher an. Mit Schwingungssensoren könnten wir das sehen, bevor die Presse steht.", "Weniger ungeplante Stillstände an den Pressen",
      p("Ungeplanter Stillstand Pressen pro Monat", "h", [14, 22], "down", 0.35, ["Sensoren für Presse 2 und 4 auswählen", "Sensoren montieren und anbinden", "Grenzwerte mit der Instandhaltung festlegen", "Alarm in die Schichtübergabe aufnehmen"])),
    idea("Ersatzteil-Kit für Förderband B", "Bei jedem Ausfall von Band B suchen wir Rollen und Riemen im ganzen Lager. Ein fertiges Kit an der Linie würde die Reparatur verkürzen.", "Kürzere Reparaturzeit an Linie B",
      p("Mittlere Reparaturzeit Band B", "min", [70, 110], "down", 0.4, ["Häufigste Ausfallteile aus den Aufträgen ziehen", "Kit zusammenstellen und beschriften", "Wandschrank an Linie B montieren", "Nachfüllen in die Wochenwartung aufnehmen"])),
    idea("Schmierplan digital abhaken", "Der Schmierplan hängt auf Papier an der Maschine und wird oft nicht ausgefüllt. Ein QR-Code pro Schmierstelle mit Abhaken am Handy wäre einfacher.", "Keine vergessenen Schmierstellen mehr",
      p("Erledigte Schmierstellen laut Plan", "%", [68, 80], "up", 0.2, ["Schmierstellen erfassen und nummerieren", "QR-Codes drucken und anbringen", "Abhakliste im Wartungstool anlegen", "Zwei Wochen testen und nachschärfen"])),
  ],
  quality: [
    idea("Kamera-Prüfung für Gehäuse G12", "Kratzer auf G12 finden wir erst beim Kunden. Eine Kamera am Bandende würde jedes Teil prüfen, statt Stichproben zu ziehen.", "Weniger Reklamationen wegen Oberflächenfehlern",
      p("Reklamationen G12 pro Monat", "Stück", [6, 11], "down", 0.5, ["Prüfkriterien mit dem Kunden abstimmen", "Kamera und Beleuchtung testen", "Prüfplatz am Bandende einrichten", "Ausschleusung und Doku einführen"])),
    idea("Erstmusterprüfung als Checkliste", "Bei jedem Werkzeugwechsel prüft jeder das erste Teil anders. Eine einheitliche Checkliste am Prüfplatz würde Fehler früher zeigen.", "Fehler nach Werkzeugwechsel früher erkennen",
      p("Ausschuss nach Werkzeugwechsel", "%", [3.5, 5.5], "down", 0.4, ["Merkmale je Teilefamilie festlegen", "Checkliste mit Bildern erstellen", "Prüfer an allen Schichten einweisen", "Ergebnisse vier Wochen auswerten"])),
    idea("Fehlersammelkarte an Linie A", "Wir wissen nicht, welche Fehler an Linie A am häufigsten sind. Eine Strichliste pro Schicht würde in zwei Wochen ein klares Bild geben.", "Gezielt die häufigsten Fehler abstellen",
      p("Ausschussquote Linie A", "%", [2.8, 4.2], "down", 0.3, ["Fehlerarten festlegen", "Karte drucken und aushängen", "Wöchentlich auswerten", "Top-3-Fehler mit Maßnahmen belegen"])),
  ],
  safety: [
    idea("Markierte Gehwege in Halle 3", "Stapler und Fußgänger kreuzen sich in Halle 3 ständig. Klar markierte Gehwege und zwei Spiegel an den Ecken würden das entschärfen.", "Weniger Beinahe-Unfälle mit Staplern",
      p("Gemeldete Beinahe-Unfälle Halle 3 pro Quartal", "Stück", [7, 12], "down", 0.5, ["Laufwege mit den Schichten begehen", "Markierung und Spiegel bestellen", "Markierung am Wochenende aufbringen", "Unterweisung für alle Fahrer"])),
    idea("Gehörschutz direkt an der Stanze", "Der Gehörschutz liegt im Spind, nicht an der Stanze. Ein Spender direkt am Arbeitsplatz würde die Tragequote deutlich erhöhen.", "Höhere Tragequote beim Gehörschutz",
      p("Tragequote Gehörschutz bei Begehung", "%", [55, 70], "up", 0.3, ["Spenderplätze festlegen", "Spender bestellen und montieren", "Kurze Unterweisung je Schicht", "Begehungen vier Wochen lang"])),
    idea("Beinahe-Unfälle per QR-Code melden", "Viele Beinahe-Unfälle werden nicht gemeldet, weil das Formular zu lang ist. Ein QR-Code an jeder Linie mit drei Fragen würde reichen.", "Mehr Meldungen, bevor etwas passiert",
      p("Gemeldete Beinahe-Unfälle pro Monat", "Stück", [3, 6], "up", 0.8, ["Drei Fragen mit der Fachkraft abstimmen", "Formular und QR-Codes erstellen", "Aushänge an allen Linien", "Monatliche Auswertung im Sicherheitskreis"])),
  ],
  material: [
    idea("Kanban für Dichtungen und Kleinteile", "Dichtungen gehen regelmäßig aus, weil niemand rechtzeitig bestellt. Zwei-Behälter-Kanban an der Linie würde das automatisch auslösen.", "Kein Stillstand mehr wegen fehlender Kleinteile",
      p("Fehlteile-Stopps pro Monat", "Stück", [5, 9], "down", 0.6, ["Kleinteile mit hohem Verbrauch auswählen", "Behälter und Karten vorbereiten", "Regal an der Linie einrichten", "Bestellrhythmus mit dem Einkauf festlegen"])),
    idea("Feste Zeitfenster für Anlieferungen", "Im Wareneingang kommen morgens fünf LKW gleichzeitig. Mit festen Zeitfenstern für die großen Lieferanten würde sich das verteilen.", "Kürzere Wartezeiten im Wareneingang",
      p("Mittlere Standzeit LKW im Wareneingang", "min", [55, 85], "down", 0.4, ["Lieferungen der letzten drei Monate auswerten", "Zeitfenster vorschlagen", "Mit den fünf größten Lieferanten abstimmen", "Vier Wochen testen"])),
    idea("Leergut-Rücklauf an Linie B", "Leere Paletten stapeln sich an Linie B und fehlen im Wareneingang. Ein fester Rücklauf zweimal pro Schicht würde beides lösen.", "Genug Paletten im Wareneingang",
      p("Palettenengpässe im Wareneingang pro Woche", "Stück", [3, 6], "down", 0.6, ["Leergutplatz an Linie B festlegen", "Rücklauf in die Staplerrunde aufnehmen", "Schild und Bodenmarkierung anbringen", "Zwei Wochen beobachten"])),
  ],
  it: [
    idea("WLAN-Ausleuchtung im Versand", "Die Handscanner verlieren im hinteren Versand ständig die Verbindung. Zwei zusätzliche Access Points würden die Lücke schließen.", "Kein Scannen auf Papier mehr im Versand",
      p("Verbindungsabbrüche Handscanner pro Tag", "Stück", [25, 45], "down", 0.7, ["Ausleuchtung messen", "Zwei Access Points bestellen", "Montage und Einrichtung", "Eine Woche Abbrüche zählen"])),
    idea("Schichtplan auf dem Handy", "Den Schichtplan sehen viele nur am Brett in der Kantine. Eine Freigabe im Personalportal fürs Handy würde viele Nachfragen sparen.", "Weniger Nachfragen zum Schichtplan",
      p("Nachfragen zum Schichtplan pro Woche", "Stück", [20, 35], "down", 0.5, ["Freigabe mit dem Betriebsrat klären", "Leserechte im Portal einrichten", "Anleitung für alle Schichten", "Nachfragen vier Wochen zählen"])),
    idea("Ein Terminal für die Schichtübergabe", "Die Übergabe steht auf Zetteln, die verloren gehen. Ein Terminal an jeder Linie mit einer einfachen Maske würde sie für alle lesbar machen.", "Keine verlorenen Übergaben mehr",
      p("Übergaben mit fehlenden Infos pro Woche", "Stück", [6, 10], "down", 0.6, ["Pflichtfelder mit den Schichtleitern festlegen", "Maske im Intranet bauen", "Terminals an den Linien aufstellen", "Papierzettel abschaffen"])),
  ],
  hr: [
    idea("Patenschaft für neue Kolleginnen und Kollegen", "Neue Leute in der Produktion fühlen sich die ersten Wochen allein gelassen. Ein Pate aus dem Team für die ersten vier Wochen würde helfen.", "Weniger Kündigungen in der Probezeit",
      p("Abgänge in der Probezeit pro Halbjahr", "Personen", [5, 9], "down", 0.4, ["Paten in jeder Schicht finden", "Kurzleitfaden für Paten schreiben", "Erste Paare bilden", "Nach drei Monaten Feedback einholen"])),
    idea("Urlaubsanträge digital genehmigen", "Urlaubsanträge liegen tagelang im Fach der Schichtleitung. Eine Genehmigung im Personalportal würde jedem sofort Bescheid geben.", "Schnellere Antwort auf Urlaubsanträge",
      p("Mittlere Bearbeitungszeit Urlaubsantrag", "Tage", [6, 10], "down", 0.6, ["Ablauf mit der Personalabteilung klären", "Genehmigung im Portal freischalten", "Schichtleitungen einweisen", "Papierantrag nach vier Wochen abschaffen"])),
    idea("Staplerschein für Springer", "Wenn ein Staplerfahrer fehlt, steht der Wareneingang. Wenn drei Springer den Staplerschein machen, sind wir abgesichert.", "Wareneingang läuft auch bei Ausfällen",
      p("Schichten ohne Staplerfahrer pro Monat", "Schichten", [4, 8], "down", 0.7, ["Drei Springer auswählen", "Schulungstermin buchen", "Prüfung und Unterweisung", "Springer in den Schichtplan aufnehmen"])),
  ],
  purchasing: [
    idea("Zweiten Lieferanten für Schrauben aufbauen", "Der Schraubenlieferant liefert seit Monaten zu spät. Ein zweiter, freigegebener Lieferant würde uns unabhängiger machen.", "Pünktliche Versorgung mit Normteilen",
      p("Pünktliche Lieferungen Normteile", "%", [72, 82], "up", 0.15, ["Drei Angebote einholen", "Muster prüfen lassen", "Lieferant freigeben", "Bestellungen aufteilen"])),
    idea("Rahmenvertrag für Filter", "Die Filter der Absauganlage bestellen wir jedes Mal einzeln zum Tagespreis. Ein Jahresvertrag würde Preis und Lieferzeit sichern.", "Günstigere Filter mit fester Lieferzeit",
      p("Kosten Filter pro Quartal", "EUR", [5200, 6800], "down", 0.18, ["Jahresbedarf ermitteln", "Angebote für Rahmenvertrag einholen", "Vertrag abschließen", "Abrufe in den Wartungsplan legen"])),
    idea("Bestellfreigabe bis 500 Euro für Meister", "Kleine Bestellungen warten oft eine Woche auf die Freigabe. Eine Freigabe bis 500 Euro direkt beim Meister würde das beschleunigen.", "Kleinteile in Tagen statt Wochen",
      p("Durchlaufzeit Kleinbestellungen", "Tage", [7, 12], "down", 0.5, ["Grenze mit dem Controlling abstimmen", "Freigaberechte im ERP anpassen", "Meister einweisen", "Durchlaufzeit vier Wochen messen"])),
  ],
  process: [
    idea("Zweiter Werkzeugwagen an Linie A", "Beim Rüsten an Linie A holen wir jedes Werkzeug einzeln. Ein zweiter, vorbereiteter Werkzeugwagen würde jeden Wechsel um etwa zehn Minuten kürzen.", "Kürzere Rüstzeiten an Linie A",
      p("Mittlere Rüstzeit Linie A", "min", [42, 55], "down", 0.25, ["Rüstablauf filmen und auswerten", "Werkzeugwagen bestellen und bestücken", "Rüsten mit vorbereitetem Wagen üben", "Rüstzeiten zwei Wochen erfassen"])),
    idea("5S im Werkzeuglager", "Im Werkzeuglager suchen wir jeden Tag nach Spannmitteln. Mit Schattenbrettern und festen Plätzen wäre alles in Sekunden da.", "Weniger Suchzeit im Werkzeuglager",
      p("Suchzeit pro Rüstvorgang", "min", [8, 14], "down", 0.6, ["Aussortieren mit dem Team", "Schattenbretter bauen", "Plätze beschriften", "Wöchentlicher 5S-Rundgang"])),
    idea("Tägliche 10-Minuten-Runde an der Linie", "Probleme an der Linie erfährt die Leitung oft erst Tage später. Eine kurze Runde am Board jeden Morgen würde sie sofort sichtbar machen.", "Probleme werden am selben Tag angegangen",
      p("Offene Linienprobleme älter als eine Woche", "Stück", [9, 15], "down", 0.5, ["Board an Linie A und B aufhängen", "Ablauf und Kennzahlen festlegen", "Runde vier Wochen täglich halten", "Auf alle Linien ausrollen"])),
  ],
  budget: [
    idea("LED-Hallenbeleuchtung in Halle 2", "Halle 2 hat noch die alten Leuchtstoffröhren, die ständig ausfallen. LED würde Strom sparen und das Tauschen erledigen.", "Weniger Stromkosten und kein Röhrentausch mehr",
      p("Stromverbrauch Beleuchtung Halle 2 pro Monat", "kWh", [9500, 12500], "down", 0.45, ["Angebote für LED-Umrüstung einholen", "Förderung prüfen", "Umrüstung am Wochenende", "Verbrauch drei Monate vergleichen"])),
    idea("Druckluftlecks suchen und abdichten", "Am Wochenende läuft der Kompressor, obwohl keine Maschine Luft braucht. Eine Leckage-Suche würde zeigen, wo wir Energie verlieren.", "Weniger Energieverbrauch der Druckluft",
      p("Laufzeit Kompressor am Wochenende", "h", [30, 42], "down", 0.5, ["Leckage-Suche mit Ultraschall beauftragen", "Lecks markieren", "Lecks abdichten", "Laufzeit vier Wochenenden messen"])),
    idea("Mehrweg statt Einweg-Kartons im Versand", "Für den Versand ins Schwesterwerk kaufen wir jede Woche neue Kartons. Mehrwegboxen würden sich in einem Jahr bezahlt machen.", "Weniger Verpackungskosten",
      p("Verpackungskosten Werksverkehr pro Monat", "EUR", [2800, 3600], "down", 0.55, ["Boxengröße festlegen", "Mehrwegboxen bestellen", "Rücklauf mit dem Schwesterwerk klären", "Kosten drei Monate vergleichen"])),
  ],
  tooling: [
    idea("Schnellwechsel-Aufnahme für Variante B", "Die Aufnahme für Variante B muss jedes Mal neu ausgerichtet werden. Eine Schnellwechsel-Aufnahme mit Passstiften würde das erledigen.", "Kein Ausrichten mehr bei Variante B",
      p("Einrichtzeit Variante B", "min", [35, 50], "down", 0.5, ["Aufnahme konstruieren", "Prototyp im Werkzeugbau fertigen", "Probelauf mit der Schicht", "Für alle Varianten prüfen"])),
    idea("Zeichnungen am Arbeitsplatz aktuell halten", "An der Maschine hängen oft alte Zeichnungsstände. Ein Bildschirm mit dem freigegebenen Stand aus dem PDM würde Fehlbohrungen verhindern.", "Keine Teile nach altem Zeichnungsstand",
      p("Fehlteile wegen alter Zeichnung pro Quartal", "Stück", [4, 8], "down", 0.75, ["Arbeitsplätze mit Zeichnungen erfassen", "Bildschirme aufstellen", "Anzeige aus dem PDM einrichten", "Papierzeichnungen einsammeln"])),
    idea("Standzeit der Stanzwerkzeuge erfassen", "Wir schleifen die Stanzwerkzeuge nach Gefühl nach. Ein Hubzähler je Werkzeug würde zeigen, wann es wirklich nötig ist.", "Weniger Grat und weniger Werkzeugbruch",
      p("Werkzeugbrüche Stanze pro Quartal", "Stück", [3, 6], "down", 0.5, ["Hubzähler auswählen", "Zähler an der Stanze anbringen", "Schleifintervalle festlegen", "Ein Quartal auswerten"])),
  ],
};

/** For a route the catalogue does not know (one a company added itself). */
export const GENERAL_IDEAS: readonly LifeIdea[] = [
  idea("Kurze Rückmeldung zu jeder Idee im Team", "Viele Ideen versanden, weil niemand Bescheid gibt, was daraus wurde. Eine Rückmeldung in der Teamrunde jede Woche würde das ändern.", "Mehr Leute bringen Ideen ein",
    p("Eingereichte Ideen pro Monat im Bereich", "Stück", [4, 8], "up", 0.5, ["Teamrunde um fünf Minuten verlängern", "Offene Ideen jede Woche durchgehen", "Ergebnisse am Board aushängen", "Nach drei Monaten auswerten"])),
  idea("Störungen an Linie A schneller melden", "Wenn Linie A steht, ruft jeder jemand anderen an. Ein fester Ablauf mit einer Nummer und einer Meldung im System würde Zeit sparen.", "Kürzere Reaktionszeit bei Störungen",
    p("Reaktionszeit bei Störungen Linie A", "min", [18, 30], "down", 0.5, ["Meldekette festlegen", "Aushang an der Linie", "Bereitschaft einweisen", "Reaktionszeiten vier Wochen messen"])),
];

/** The ideas a route draws from. */
export const ideasFor = (routeKey: string): readonly LifeIdea[] => LIFE_IDEAS[routeKey] ?? GENERAL_IDEAS;
