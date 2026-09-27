// LANDING. One claim, the product, the problem in two bars, three steps with the real screens, one ask.
// Screenshots are the real app at 1440px @2x (public/screenshots/*.png). When you retake one, bump the -N suffix so no cache serves the old picture.
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import styles from "./page.module.css";

const P = SITE.promiseDays;

// The three steps, each with the screen it happens on. Keep every body to two sentences.
// `why` is the one design reason we give a customer in the room - why the screen is this small.
const STEPS = [
  { who: "Team member", title: "Raise it in one box.",
    body: "Problem or idea, one line, a screenshot if it helps. NextUp reads it against the company's own org chart and routing map, names the owner and the day an answer is due.",
    why: "If raising a problem takes longer than complaining about it, it stays in the corridor. So: no form, no category tree, no ticket - the routing is done for you.",
    shot: "/screenshots/raise-box-3.png", w: 2360, h: 1032, tight: true,
    alt: "The raise box: idea or problem toggle, one text field, Attach and Affected, and the send arrow" },
  { who: "Team leader", title: "Answer in one click.",
    body: `Open items, oldest first, each with the days left on its clock. Yes, no and why, pass it on, or ask a question. Miss the ${P}-day promise and it moves to the deputy by itself.`,
    why: "A leader's job here is to answer, not to manage a tool. Four buttons and no free-text status: an answer takes seconds, and every answer is a fact the ledger can count.",
    shot: "/screenshots/inbox-3.png", w: 2880, h: 1400,
    alt: "The inbox: cases sorted by age with days left, the selected case, and four buttons" },
  { who: "Everyone", title: "See what is waiting on whom.",
    body: "One list for the whole company: how long each case has been open, every desk it has been on, what stage it reached, and a score built from the case, never the person.",
    why: "Waiting only shrinks when the people waiting can see it - and a score on the case, not the person, keeps it safe to raise things anonymously.",
    shot: "/screenshots/dashboard-3.png", w: 2880, h: 1400,
    alt: "The dashboard: every problem and idea with open since, stage, on whose desk and score" },
];

export default function LandingPage() {
  return (
    <>
      <section className={styles.hero}>
        <h1>{SITE.tagline}</h1>
        <p className={styles.lead}>
          Raise a problem or an idea in one box. NextUp names who owns it and when they owe an answer.
          Everyone sees what is waiting on whom.
        </p>
        <div className={styles.cta}>
          <Button href="/contact">Book a pilot</Button>
          <Button href="/login" variant="ghost">Log in</Button>
        </div>
      </section>

      <figure className={styles.product}>
        <Image
          src="/screenshots/overview-3.png" width={2880} height={1800} preload
          sizes="(max-width: 1240px) 100vw, 1200px"
          alt="The manager overview: what is waiting on you, four numbers, where the waiting goes, the wait ledger"
        />
        <figcaption>
          <span className="nh-eyebrow">Manager · Overview</span>
          What is waiting on you, the four numbers that moved, where the waiting goes. Two of them get reported upward: median time to the first answer, and the share answered within the {P}-day promise.
        </figcaption>
      </figure>

      <figure className={styles.clock} aria-label="Typical wait today versus the work inside it">
        <div className={styles.clockRow}>
          <div className={styles.clockLabel}>From request to first answer</div>
          <div className={styles.bar}><div className={styles.barFill} style={{ width: "100%" }} /></div>
          <div className={`${styles.clockVal} nh-mono`}>19 days</div>
        </div>
        <div className={styles.clockRow}>
          <div className={styles.clockLabel}>Of which actual work</div>
          <div className={styles.bar}><div className={`${styles.barFill} ${styles.barAccent}`} style={{ width: "16%" }} /></div>
          <div className={`${styles.clockVal} nh-mono`}>3 days</div>
        </div>
        <figcaption className={styles.clockNote}>The rest is waiting for someone to say yes, no, or &ldquo;not me&rdquo;.</figcaption>
      </figure>

      <section className={styles.how} id="how">
        <h2>How it works</h2>
        {STEPS.map((s, i) => (
          <div className={styles.step} key={s.title}>
            <div className={styles.stepText}>
              <div className={styles.stepHead}>
                <span className={styles.stepWho}>{i + 1} · {s.who}</span>
                <h3>{s.title}</h3>
              </div>
              <div className={styles.stepCopy}>
                <p>{s.body}</p>
                <p className={styles.stepWhy}><span className="nh-eyebrow">Why</span>{s.why}</p>
              </div>
            </div>
            <div className={styles.stepShot} data-tight={s.tight ? "true" : undefined}>
              <Image src={s.shot} alt={s.alt} width={s.w} height={s.h} sizes="(max-width: 1240px) 100vw, 1200px" />
            </div>
          </div>
        ))}
      </section>

      <section className={styles.close}>
        <h2>Set up in an afternoon.</h2>
        <p>The only thing to fill in is a map of decision types: fifteen rows, each with one owner and one deputy. A department head does it in twenty minutes.</p>
        <Button href="/contact">Book a pilot</Button>
      </section>
    </>
  );
}
