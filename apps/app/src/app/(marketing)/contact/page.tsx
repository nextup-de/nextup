// CONTACT / book a pilot. What a pilot is on the left, the request form on the right.
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/ContactForm";
import { LEGAL, SITE } from "@/config/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Book a pilot",
  description: "Five working days, one department, one decision type. Free. Tell us which decision keeps waiting.",
};

const WEEK = [
  ["Day 1", "We fill in the routing table for your decision type with the department head. Twenty minutes."],
  ["Days 2-4", "Real requests go through one field. Owners answer from an inbox with a clock."],
  ["Day 5", "You get the wait ledger: median hours to first answer, share within the promise, where the waiting went."],
  ["After", "Thirty minutes of feedback from you. A one-page report you can forward from us."],
];

export default function ContactPage() {
  return (
    <section className={styles.wrap}>
      <div className={styles.intro}>
        <p className="nh-eyebrow">Book a pilot</p>
        <h1>Which decision keeps waiting?</h1>
        <p className={styles.lead}>
          Tell us the one that always takes weeks. We time it with you for five working days - no integration,
          no per-person metrics, nothing to install. It is free; we ask for thirty minutes of feedback.
        </p>

        <ol className={styles.week}>
          {WEEK.map(([d, t]) => (
            <li key={d}>
              <span className="nh-mono">{d}</span>
              <p>{t}</p>
            </li>
          ))}
        </ol>

        <div className={styles.direct}>
          <p className="nh-eyebrow">Prefer e-mail?</p>
          <a className={styles.mail} href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          <p className={styles.directNote}>
            {LEGAL.operator}, {LEGAL.org}, Berlin. We reply within two working days - the {SITE.name} promise applies to us too.{" "}
            <Link href="/pricing">See what comes after the pilot</Link>.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <h2>Request a pilot</h2>
        <ContactForm to={LEGAL.email} />
      </div>
    </section>
  );
}
