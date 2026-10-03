// LANDING. The question, answered live: the hero is one box that routes whatever a visitor types on the demo company's map.
// Then one request both ways (the pinned scene), the screens by role, what is never measured, the pilot, one ask.
// Screenshots are the real app at 1440px @2x (public/screenshots/*.png). When you retake one, bump the -N suffix so no cache serves the old picture.
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { RoleScreens, type RoleScreen } from "@/components/marketing/RoleScreens";
import { RouteDemo } from "@/components/marketing/RouteDemo";
import { WaitScene } from "@/components/marketing/WaitScene";
import { PILOT_WEEK, PRINCIPLES, SITE } from "@/config/site";
import { ROUTES } from "@/features/demo/seed";
import styles from "./page.module.css";

const P = SITE.promiseDays;

// The demo company's routing map as plain rows for the hero. The story in the pinned scene follows its first row.
const MAP = ROUTES.map((r) => ({ id: r.id, type: r.type, keys: r.keys, owner: r.owner.name, role: r.owner.role, deputy: r.deputy }));
const SPEND = ROUTES[0];
const roleOf = (name: string) => ROUTES.find((r) => r.owner.name === name)?.owner.role ?? "Deputy";

// What the hero's box types by itself, one after another. Each one hits a different row of the map.
const REQUEST = "Night shift has no one who can sign a €300 parts order";
const EXAMPLES = [
  REQUEST,
  "Two apprentices have had no system login for four weeks",
  "Tolerance drift on station 7 - who owns the gauge calibration?",
];

// One screen per role. Keep every body to two sentences.
// `why` is the one design reason we give a customer in the room - why the screen is this small.
const SCREENS: RoleScreen[] = [
  { who: "Team member", title: "Raise it in one box.", path: "/acme/raise",
    body: "Problem or idea, one line, a screenshot if it helps. NextUp reads it against the company's own org chart and routing map, names the owner and the day an answer is due.",
    why: "If raising a problem takes longer than complaining about it, it stays in the corridor. So: no form, no category tree, no ticket - the routing is done for you.",
    shot: "/screenshots/raise-box-3.png", w: 2360, h: 1032, tight: true,
    alt: "The raise box: idea or problem toggle, one text field, Attach and Affected, and the send arrow" },
  { who: "Team leader", title: "Answer in one click.", path: "/acme/leader",
    body: `Open items, oldest first, each with the days left on its clock. Yes, no and why, pass it on, or ask a question. Miss the ${P}-day promise and it moves to the deputy by itself.`,
    why: "A leader's job here is to answer, not to manage a tool. Four buttons and no free-text status: an answer takes seconds, and every answer is a fact the ledger can count.",
    shot: "/screenshots/inbox-3.png", w: 2880, h: 1400,
    alt: "The inbox: cases sorted by age with days left, the selected case, and four buttons" },
  { who: "Everyone", title: "See what is waiting on whom.", path: "/acme/dashboard",
    body: "One list for the whole company: how long each case has been open, every desk it has been on, what stage it reached, and a score built from the case, never the person.",
    why: "Waiting only shrinks when the people waiting can see it - and a score on the case, not the person, keeps it safe to raise things anonymously.",
    shot: "/screenshots/dashboard-3.png", w: 2880, h: 1400,
    alt: "The dashboard: every problem and idea with open since, stage, on whose desk and score" },
  { who: "Manager", title: "Report two numbers.", path: "/acme/manager",
    body: `What is waiting on you, the four numbers that moved, where the waiting goes. Two of them get reported upward: median time to the first answer, and the share answered within the ${P}-day promise.`,
    why: "Waiting that nobody counts cannot be shortened. The ledger files every waiting day under one of four reasons, so the fix is usually a row in the map, not another meeting.",
    shot: "/screenshots/overview-3.png", w: 2880, h: 1800,
    alt: "The manager overview: what is waiting on you, four numbers, where the waiting goes, the wait ledger" },
];

export default function LandingPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroIn}>
          <h1>{SITE.tagline}</h1>
          <p className={styles.lead}>
            Raise a problem or an idea in one box. NextUp names who owns it and when they owe an answer.
          </p>
          <RouteDemo routes={MAP} promiseDays={P} examples={EXAMPLES} />
        </div>
      </section>

      <WaitScene
        request={`${REQUEST}.`} from="Night shift, 4-series" decision={SPEND.type} promiseDays={P}
        owner={SPEND.owner.name} ownerRole={SPEND.owner.role} deputy={SPEND.deputy} deputyRole={roleOf(SPEND.deputy)}
      />

      <section className={styles.band} id="how">
        <div className={styles.bandHead}>
          <p className="nh-eyebrow">How it works</p>
          <h2 className={styles.display}>One box. One inbox. One list. One ledger.</h2>
        </div>
        <RoleScreens screens={SCREENS} />
      </section>

      <section className={`${styles.band} ${styles.never}`}>
        <div className={styles.bandHead}>
          <p className="nh-eyebrow">What it never does</p>
          <h2 className={styles.display}>It measures cases. Never people.</h2>
          <p className={styles.aside}>
            A works council gets a written description of what is and is not measured before the pilot starts.
          </p>
        </div>
        <ul className={styles.neverList}>
          {PRINCIPLES.map(([h, b]) => (
            <li key={h}>
              <h3>{h}</h3>
              <p>{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.band} id="pilot">
        <div className={`${styles.bandHead} ${styles.split}`}>
          <div className={styles.bandHead}>
            <p className="nh-eyebrow">The pilot</p>
            <h2 className={styles.display}>Five working days. One department. One decision type.</h2>
          </div>
          <p className={styles.aside}>
            Set up in an afternoon. The only thing to fill in is a map of decision types: fifteen rows, each with
            one owner and one deputy. A department head does it in twenty minutes.
          </p>
        </div>
        <ol className={styles.week}>
          {PILOT_WEEK.map(([d, t]) => (
            <li key={d}>
              <span>{d}</span>
              <p>{t}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.close}>
        <div className={styles.closeIn}>
          <h2 className={styles.display}>Which decision keeps waiting?</h2>
          <div className={styles.closeAsk}>
            <p>Tell us the one that always takes weeks. We time it with you for five working days. It is free; we ask for thirty minutes of feedback.</p>
            <div className={styles.cta}>
              <Button href="/contact" className={styles.book}>Book a pilot</Button>
              <Link href="/pricing" className={styles.down}>See what comes after</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
