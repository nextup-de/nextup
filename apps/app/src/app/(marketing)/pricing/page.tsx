// PRICING. Free pilot, one flat company plan, and "talk to us" for groups. Per company, not per seat.
import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description: "A free five-day pilot, then one flat price per company. No seats to count, nothing to integrate.",
};

// Company plan is anchored on the canvas: a department head signs off alone under about €5k a year.
const COMPANY_MONTH = 390;
const COMPANY_YEAR = COMPANY_MONTH * 12;
const fmt = (n: number) => n.toLocaleString("en-IE"); // "4,680"

const TIERS = [
  {
    key: "pilot",
    eyebrow: "Start here",
    name: "Pilot",
    price: "€0",
    per: "five working days",
    lead: "One department, one decision type, real requests. You leave with two numbers you did not have before.",
    items: [
      "Routing table for your decision type, filled in with you",
      "Inbox with a clock for the owners it names",
      "The wait ledger at the end of the week",
      "A one-page report you can forward to your boss",
    ],
    ask: "In return: thirty minutes of feedback and permission to quote the numbers, anonymised.",
    cta: { label: "Book a pilot", href: "/contact", variant: "accent" as const },
    featured: true,
  },
  {
    key: "company",
    eyebrow: "After the pilot",
    name: "Company",
    price: `€${COMPANY_MONTH}`,
    per: `per month, billed yearly (€${fmt(COMPANY_YEAR)})`,
    lead: "Everyone in the company can raise a case. Every leader gets an inbox. Management gets the ledger.",
    items: [
      "Unlimited people and departments - no seats to count",
      "The three home screens: My cases, Inbox, Overview",
      `Wait ledger with the ${SITE.promiseDays}-day promise, stall reasons, movement since baseline`,
      "Routing table editor, members and roles, anonymous raising as a company switch",
      "Hosting in the EU, export of everything at any time, e-mail support",
    ],
    ask: "Under the line most department heads can sign alone - no procurement round needed.",
    cta: { label: "Start with a pilot", href: "/contact", variant: "primary" as const },
    featured: false,
  },
  {
    key: "group",
    eyebrow: "Several companies",
    name: "Group",
    price: "Let's talk",
    per: "per group, yearly",
    lead: "Several companies or sites under one roof, each with its own data, branding and routing table.",
    items: [
      "Everything in Company, per tenant",
      "Single sign-on and a data processing agreement (AVV)",
      "A works-council-ready description of what is and is not measured",
      "Onboarding for each department head - twenty minutes each",
    ],
    ask: "Priced per group, not per company, once we know the shape of yours.",
    cta: { label: "Contact us", href: "/contact", variant: "ghost" as const },
    featured: false,
  },
];

const EVERY = [
  ["Nothing to integrate", "No SSO, no mailbox access, no read access to your systems. A pilot needs one field and one routing table."],
  ["Cases, not people", "There is no per-person metric in the data model. The ledger measures how long cases wait, never how individuals perform."],
  ["Your data, in the EU", "Export every case, event and number at any time. Deletion on request. No cookies, no tracking, no third-party fonts on this site."],
];

const FAQ = [
  ["Why per company and not per seat?", "A tool for raising things fails the moment you count who is allowed to raise them. Everyone raises; the price does not change when you add people."],
  ["What exactly is a pilot?", "Five working days in one department, timing one recurring decision type - approve a tool, sign off a clause, answer a data request. Real requests, real owners. At the end you see the median time to first answer and where the waiting went. It is free; we ask for thirty minutes of feedback."],
  ["Do you need access to our systems?", "No. Cases are raised in one field on the site. Optionally, an employee forwards a single e-mail thread to one address - consent is the act of forwarding. There is no mailbox connection and no monitoring."],
  ["We have a works council. Is this a problem?", `Usually not, and we would rather have the conversation early. ${SITE.name} leads with problems and blockers, not an ideas scheme, and it records no per-person metrics. We can provide a written description of what is measured for the works council before the pilot starts.`],
  ["Where is our data stored?", "On servers in the EU. The privacy policy names the hosting provider. Your data is keyed to your company and never visible to another tenant."],
];

export default function PricingPage() {
  return (
    <>
      <section className={styles.head}>
        <p className="nh-eyebrow">Pricing</p>
        <h1>Per company, not per seat.</h1>
        <p className={styles.lead}>A free pilot first, because a number is a better argument than a demo. Then one flat price a department head can sign alone.</p>
      </section>

      <section className={styles.tiers} aria-label="Plans">
        {TIERS.map((t) => (
          <article key={t.key} className={`${styles.tier} ${t.featured ? styles.featured : ""}`}>
            <p className="nh-eyebrow">{t.eyebrow}</p>
            <h2>{t.name}</h2>
            <p className={styles.price}><span className="nh-mono">{t.price}</span><small>{t.per}</small></p>
            <p className={styles.tierLead}>{t.lead}</p>
            <ul className={styles.items}>
              {t.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p className={styles.ask}>{t.ask}</p>
            <Button href={t.cta.href} variant={t.cta.variant} block>{t.cta.label}</Button>
          </article>
        ))}
      </section>
      <p className={`${styles.fine} nh-mono`}>Prices are net of VAT and indicative until the first pilots close.</p>

      <section className={styles.every}>
        <p className="nh-eyebrow">In every plan</p>
        <div className={styles.everyGrid}>
          {EVERY.map(([h, b]) => (
            <div key={h}>
              <h3>{h}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.faq}>
        <p className="nh-eyebrow">Questions we get</p>
        <div className={styles.faqList}>
          {FAQ.map(([q, a]) => (
            <details key={q} className={styles.faqItem} name="faq">
              <summary>
                {q}
                <span className={styles.faqIcon} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>
                </span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
