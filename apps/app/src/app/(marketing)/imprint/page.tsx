// IMPRINT / Impressum (§ 5 DDG, § 18 Abs. 2 MStV). Operator data comes from LEGAL in src/config/site.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, SITE } from "@/config/site";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Imprint",
  description: `Legal notice (Impressum) for ${SITE.name}: who operates this site and how to reach them.`,
  robots: { index: false }, // required page, not a landing page
};

export default function ImprintPage() {
  return (
    <div className={styles.wrap}>
      <div>
        <header className={styles.head}>
          <p className="nh-eyebrow">Imprint · Impressum</p>
          <h1>Who runs this site</h1>
          <p>
            {SITE.name} is a student project. The legally binding version of this notice is the German one below;
            the English text is a courtesy translation.
          </p>
        </header>

        <div className={styles.prose}>
          <section>
            <h2>Operator · Anbieter</h2>
            <p>Angaben gemäß § 5 DDG · Information pursuant to § 5 DDG (German Digital Services Act)</p>
            <address className={styles.address}>
              <strong>{LEGAL.operator}</strong><br />
              c/o {LEGAL.org}<br />
              {LEGAL.street}<br />
              {LEGAL.city}<br />
              {LEGAL.country}
            </address>
          </section>

          <section>
            <h2>Contact · Kontakt</h2>
            <p>E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>
            <p>Responses within two working days. · Antwort innerhalb von zwei Werktagen.</p>
          </section>

          <section>
            <h2>Responsible for content · Verantwortlich für den Inhalt</h2>
            <p>Verantwortlich nach § 18 Abs. 2 MStV: {LEGAL.operator}, Anschrift wie oben.</p>
            <p>Responsible under § 18 (2) of the German State Media Treaty: {LEGAL.operator}, address as above.</p>
          </section>

          <section>
            <h2>Student project · Studentisches Projekt</h2>
            <p>
              Diese Website und die Anwendung {SITE.name} entstehen im Rahmen des Studiums an der {LEGAL.org}, Berlin.
              Betreiber und inhaltlich verantwortlich ist ausschließlich die oben genannte Person; die Hochschule ist
              nicht Betreiberin dieser Website. Es besteht keine Eintragung im Handelsregister und keine
              Umsatzsteuer-Identifikationsnummer.
            </p>
            <p lang="en">
              This site and the {SITE.name} application are built as part of a degree programme at {LEGAL.org}, Berlin.
              The person named above is the sole operator and responsible for its content; the university does not
              operate this site. There is no commercial register entry and no VAT ID.
            </p>
          </section>

          <section>
            <h2>Liability · Haftung</h2>
            <h3>Haftung für Inhalte</h3>
            <p>
              Die Inhalte dieser Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit
              und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden. Als Diensteanbieter sind wir
              gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.
              Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
              Informationen zu überwachen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen
              nach den allgemeinen Gesetzen bleiben hiervon unberührt.
            </p>
            <h3>Haftung für Links</h3>
            <p>
              Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
              Für diese fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
              Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
            </p>
            <h3>Urheberrecht</h3>
            <p>
              Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
              Urheberrecht. Beispieldaten in der Demo (Firmen, Personen, Fälle) sind frei erfunden; Ähnlichkeiten mit
              realen Unternehmen oder Personen sind zufällig.
            </p>
            <p lang="en">
              Content is provided with care but without warranty as to accuracy, completeness or currency. We are not
              responsible for the content of external sites we link to. All content is protected under German
              copyright law. Demo data (companies, people, cases) is fictional.
            </p>
          </section>
        </div>
      </div>

      <aside className={styles.aside}>
        <div className={styles.card}>
          <h2>At a glance</h2>
          <ul>
            <li>Operated by {LEGAL.operator}, Berlin</li>
            <li>Student project at {LEGAL.org}</li>
            <li>Reach us by e-mail, reply within two working days</li>
          </ul>
          <p>
            How we handle data: <Link href="/privacy">Privacy policy</Link>.
          </p>
        </div>
      </aside>
    </div>
  );
}
