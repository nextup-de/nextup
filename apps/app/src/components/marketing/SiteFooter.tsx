import Image from "next/image";
import Link from "next/link";
import { LEGAL, SITE } from "@/config/site";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} />
        </div>
        <nav className={styles.links} aria-label="Footer">
          <Link href="/#how">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Book a pilot</Link>
          <Link href="/login">Log in</Link>
        </nav>
        <nav className={`${styles.links} ${styles.legal}`} aria-label="Legal">
          <Link href="/imprint">Imprint</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
      <div className={styles.bottom}>
        <p>
          {LEGAL.operator} · {LEGAL.org} · Berlin
        </p>
        <p className={`${styles.note} nh-mono`}>No cookies. No tracking. Fonts served from this site.</p>
      </div>
    </footer>
  );
}
