// Two-column auth layout: dark side panel (brand + a message) and the centered card.
import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/config/site";
import { Ground } from "@/components/shell/Ground";
import { LoginPageTransition } from "./LoginPageTransition";
import styles from "./AuthShell.module.css";

type Props = { side: React.ReactNode; children: React.ReactNode; art?: "hand"; backHref?: string };

export function AuthShell({ side, children, art, backHref = "/" }: Props) {
  if (art === "hand") {
    return (
      <LoginPageTransition key={backHref} step={backHref === "/login" ? "company" : "find"}>
        <Ground />
        <Link className={styles.artLogo} href="/" aria-label={`${SITE.name} home`}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} priority />
        </Link>
        <section className={styles.authPanel}>
          <aside className={styles.art}>
            <Image
              className={styles.hand}
              src="/brand/login-hand.png"
              alt=""
              fill
              sizes="(max-width: 860px) 0px, 58vw"
              priority
            />
            <div className={`${styles.sideBody} ${styles.artContent}`}>{side}</div>
          </aside>
          <main className={styles.artMain}>
            <Link className={styles.artBack} href={backHref}>← Back</Link>
            <div className={`${styles.card} ${styles.artCard}`}>{children}</div>
          </main>
        </section>
      </LoginPageTransition>
    );
  }

  return (
    <div className={styles.shell}>
      <Ground />
      <aside className={styles.side}>
        <Link className={styles.logo} href="/" aria-label={`${SITE.name} home`}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} />
        </Link>
        <div className={styles.sideBody}>{side}</div>
        <p className={`${styles.sideFoot} nh-mono`}>Berlin · 2026</p>
      </aside>
      <main className={styles.main}>
        <div className={styles.card}>{children}</div>
      </main>
    </div>
  );
}

// Small building blocks pages compose inside the card.
export function AuthTitle({ step, title, sub }: { step?: string; title: string; sub?: string }) {
  return (
    <>
      {step && <p className="nh-eyebrow">{step}</p>}
      <h1 className={styles.title}>{title}</h1>
      {sub && <p className={styles.sub}>{sub}</p>}
    </>
  );
}

export function AuthFoot({ children }: { children: React.ReactNode }) {
  return <p className={styles.foot}>{children}</p>;
}

export function AuthStats({ items }: { items: [string, string][] }) {
  return (
    <div className={styles.stats}>
      {items.map(([v, l]) => (
        <div key={l}><span className="nh-mono">{v}</span><small>{l}</small></div>
      ))}
    </div>
  );
}

// The three home screens, one line each - what a visitor will see after the second step.
export function AuthRoles({ items }: { items: [string, string, string][] }) {
  return (
    <ul className={styles.roles}>
      {items.map(([who, screen, line]) => (
        <li key={who}><span className="nh-eyebrow">{who}</span><strong>{screen}</strong><small>{line}</small></li>
      ))}
    </ul>
  );
}
