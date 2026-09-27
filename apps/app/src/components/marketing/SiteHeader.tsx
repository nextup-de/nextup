import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ onLoginPage = false }: { onLoginPage?: boolean }) {
  return (
    <header className={styles.nav}>
      <Link className={styles.logo} href="/" aria-label={`${SITE.name} home`}>
        <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} priority />
      </Link>
      <nav className={styles.links} aria-label="Site">
        <Link href="/#how">How it works</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className={styles.actions}>
        {!onLoginPage && <Button href="/login" variant="ghost" size="sm">Log in</Button>}
        <Button href="/contact" size="sm">Book a pilot</Button>
      </div>
    </header>
  );
}
