// PRIVACY POLICY / Datenschutzerklärung (Art. 13 DSGVO). German text is binding; English summary on top.
// Facts this page states - no cookies, no tracking, fonts self-hosted, the contact form is stored on
// our own server only to reply (src/server/actions/pilot.ts) - must stay true. If you add analytics,
// a session cookie or a third party to the form, update this page in the same PR.
import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, SITE } from "@/config/site";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${SITE.name} handles personal data: no cookies, no tracking, no third-party fonts.`,
  robots: { index: false },
};

const updated = new Date(LEGAL.updated).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function PrivacyPage() {
  const h = LEGAL.hosting;
  return (
    <div className={styles.wrap}>
      <div>
        <header className={styles.head}>
          <p className="nh-eyebrow">Privacy · Datenschutz</p>
          <h1>What this site does with your data</h1>
          <p>
            Very little. The binding version of this policy is the German text below (Art. 13 DSGVO); the
            summary in the box is a courtesy translation.
          </p>
          <p className={`${styles.stamp} nh-mono`}>Stand · Last updated: {updated}</p>
        </header>

        <div className={styles.prose} lang="de">
          <section>
            <h2>1. Verantwortlicher</h2>
            <p>Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
            <address className={styles.address}>
              <strong>{LEGAL.operator}</strong><br />
              c/o {LEGAL.org}<br />
              {LEGAL.street}, {LEGAL.city}, {LEGAL.country}<br />
              E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
            </address>
            <p>Ein Datenschutzbeauftragter ist nicht bestellt, da die gesetzlichen Voraussetzungen hierfür nicht vorliegen.</p>
          </section>

          <section>
            <h2>2. Das Wichtigste vorweg</h2>
            <ul>
              <li>Diese Website setzt <strong>keine Cookies</strong> und verwendet <strong>keine Analyse- oder Tracking-Werkzeuge</strong>. Deshalb gibt es auch kein Cookie-Banner.</li>
              <li>Es werden <strong>keine Inhalte von Drittanbietern</strong> nachgeladen. Schriften werden von diesem Server ausgeliefert, nicht von Google oder einem anderen Dienst.</li>
              <li>Das Kontaktformular speichert Ihre Angaben auf unserem eigenen Server - nur, damit wir antworten können. Kein Dritter erhält sie.</li>
              <li>Personenbezogene Daten werden nur verarbeitet, soweit es für den Betrieb der Seite technisch nötig ist oder Sie uns selbst schreiben.</li>
            </ul>
          </section>

          <section>
            <h2>3. Hosting und Server-Logfiles</h2>
            <p>
              Beim Aufruf dieser Website verarbeitet der Server automatisch Daten, die Ihr Browser übermittelt:
              IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite, übertragene Datenmenge, Referrer-URL sowie
              Browsertyp und Betriebssystem. Diese Daten werden nicht mit anderen Datenquellen zusammengeführt und
              nicht zur Identifizierung einzelner Personen ausgewertet.
            </p>
            <p>
              <strong>Zweck</strong>: Auslieferung der Seite, Sicherstellung von Stabilität und Sicherheit, Abwehr von Angriffen.{" "}
              <strong>Rechtsgrundlage</strong>: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb).{" "}
              <strong>Speicherdauer</strong>: Logfiles werden spätestens nach 14 Tagen gelöscht, sofern kein sicherheitsrelevanter Vorfall eine längere Aufbewahrung erfordert.
            </p>
            {h ? (
              <p>
                <strong>Hosting-Anbieter</strong>: {h.provider}, Serverstandort {h.location}. Der Anbieter verarbeitet die
                Daten in unserem Auftrag auf Grundlage eines Auftragsverarbeitungsvertrags nach Art. 28 DSGVO. Dessen
                Datenschutzhinweise: <a href={h.privacyUrl} rel="noopener noreferrer">{h.privacyUrl}</a>.
              </p>
            ) : (
              <p>
                <strong>Hosting-Anbieter</strong>: Die Website befindet sich im Aufbau und wird derzeit nicht öffentlich
                gehostet. Vor der Veröffentlichung wird an dieser Stelle der Hosting-Anbieter mit Serverstandort und
                Auftragsverarbeitungsvertrag (Art. 28 DSGVO) benannt.
              </p>
            )}
          </section>

          <section>
            <h2>4. Cookies, lokaler Speicher, Tracking</h2>
            <p>
              Diese Website setzt keine Cookies und legt keine Daten im lokalen Speicher Ihres Browsers ab. Es werden
              keine Analyse-, Werbe- oder Social-Media-Dienste eingebunden und keine Nutzungsprofile erstellt.
            </p>
            <p>
              Die Anmeldeseiten sind derzeit eine Vorschau ohne echte Benutzerkonten. Sobald Konten für Pilotkunden
              aktiv sind, setzt die Anwendung nach der Anmeldung ein <strong>technisch notwendiges Sitzungs-Cookie</strong>,
              das Sie während der Sitzung angemeldet hält. Ein solches Cookie ist für die von Ihnen ausdrücklich
              gewünschte Funktion erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und bedarf keiner Einwilligung. Diese
              Erklärung wird dann entsprechend ergänzt.
            </p>
          </section>

          <section>
            <h2>5. Schriften</h2>
            <p>
              Die verwendeten Schriften (Manrope, IBM Plex Mono) werden beim Bau der Website einmalig eingebunden und
              von unserem eigenen Server ausgeliefert. Beim Besuch der Seite wird keine Verbindung zu Google Fonts oder
              einem anderen Schriftendienst aufgebaut; Ihre IP-Adresse wird nicht an Dritte übermittelt.
            </p>
          </section>

          <section>
            <h2>6. Kontaktaufnahme</h2>
            <p>
              Das Formular auf der Seite <Link href="/contact">Book a pilot</Link> überträgt Ihre Angaben an unseren
              eigenen Server und speichert sie dort in unserer Datenbank. Es werden keine Drittanbieter eingebunden;
              ein verstecktes Feld dient nur der Erkennung automatisierter Eingaben und wird nicht gespeichert.
            </p>
            <p>
              Ob über das Formular oder per E-Mail: wir verarbeiten die von Ihnen mitgeteilten Daten (Name, E-Mail-Adresse,
              Unternehmen, Inhalt der Nachricht) ausschließlich zur Bearbeitung Ihrer Anfrage und für eventuelle
              Anschlussfragen. <strong>Rechtsgrundlage</strong>: Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Pilotprojekts)
              bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen).{" "}
              <strong>Speicherdauer</strong>: bis die Anfrage erledigt ist; danach längstens sechs Monate, sofern keine
              gesetzlichen Aufbewahrungspflichten entgegenstehen. Eine Weitergabe an Dritte findet nicht statt.
            </p>
          </section>

          <section>
            <h2>7. Die Anwendung {SITE.name} und Pilotprojekte</h2>
            <p>
              Die auf dieser Website zugängliche Anwendung ist derzeit eine <strong>Demo mit frei erfundenen
              Beispieldaten</strong>. Es werden keine realen Personen- oder Unternehmensdaten verarbeitet.
            </p>
            <p>
              Für Pilotprojekte mit Unternehmen gilt: Das jeweilige Unternehmen ist Verantwortlicher für die Daten
              seiner Beschäftigten; wir verarbeiten diese als Auftragsverarbeiter auf Grundlage eines
              Auftragsverarbeitungsvertrags (Art. 28 DSGVO), der vor Beginn des Pilotprojekts geschlossen wird.
              Das Datenmodell enthält <strong>keine personenbezogenen Leistungskennzahlen</strong>: Gemessen wird,
              wie lange Vorgänge warten, nicht wie einzelne Personen arbeiten. Anonymes Einreichen von Vorgängen kann
              pro Unternehmen aktiviert werden. Sämtliche Daten eines Unternehmens können jederzeit exportiert und auf
              Wunsch gelöscht werden. Die Datenhaltung erfolgt in der Europäischen Union.
            </p>
          </section>

          <section>
            <h2>8. Empfänger und Drittlandtransfer</h2>
            <p>
              Personenbezogene Daten werden nicht an Dritte weitergegeben, mit Ausnahme des in Abschnitt 3 genannten
              Hosting-Anbieters als Auftragsverarbeiter. Eine Übermittlung in Länder außerhalb der Europäischen Union
              bzw. des Europäischen Wirtschaftsraums findet nicht statt.
            </p>
          </section>

          <section>
            <h2>9. Ihre Rechte</h2>
            <p>Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden personenbezogenen Daten:</p>
            <ul>
              <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
              <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
              <li>Recht auf Löschung (Art. 17 DSGVO)</li>
              <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Recht auf Widerspruch gegen eine Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21 DSGVO)</li>
            </ul>
            <p>
              Zur Ausübung dieser Rechte genügt eine E-Mail an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
            </p>
            <p>
              Sie haben zudem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).
              Zuständig für uns ist die <strong>Berliner Beauftragte für Datenschutz und Informationsfreiheit</strong>,
              Alt-Moabit 59-61, 10555 Berlin, <a href="https://www.datenschutz-berlin.de" rel="noopener noreferrer">www.datenschutz-berlin.de</a>.
            </p>
          </section>

          <section>
            <h2>10. Automatisierte Entscheidungen</h2>
            <p>
              Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht
              statt. Auch in der Anwendung schlägt das System Zuständigkeiten nur vor; entschieden wird immer von einer
              Person.
            </p>
          </section>

          <section>
            <h2>11. Änderungen dieser Erklärung</h2>
            <p>
              Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die Rechtslage ändert - etwa wenn
              ein Hosting-Anbieter benannt wird oder Benutzerkonten aktiviert werden. Das Datum der letzten Änderung steht am Anfang dieser Seite.
            </p>
          </section>
        </div>
      </div>

      <aside className={styles.aside}>
        <div className={styles.card}>
          <h2>Summary in English</h2>
          <ul>
            <li className={styles.no}>No cookies, no analytics, no tracking - so no cookie banner.</li>
            <li className={styles.no}>No third-party requests: fonts are served from this site, not Google.</li>
            <li>Server logs (IP, time, page) are kept up to 14 days for security - Art. 6(1)(f) GDPR.</li>
            <li>The contact form is stored on our own server, only to reply to you - no third party sees it.</li>
            <li>The app is a demo with fictional data. Pilots run under a data processing agreement; no per-person metrics; data stays in the EU.</li>
            <li>You can ask for access, correction, deletion or export at any time by e-mail, and complain to the Berlin data protection authority.</li>
          </ul>
          <p>
            Controller: {LEGAL.operator}, Berlin - see the <Link href="/imprint">imprint</Link>.
          </p>
        </div>
      </aside>
    </div>
  );
}
