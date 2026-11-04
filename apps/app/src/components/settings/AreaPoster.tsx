// The printable QR poster of one area (FLR D13). Props in, JSX out: the page builds the SVG and the texts.
import Link from "next/link";
import s from "./settings.module.css";
import styles from "./AreaPoster.module.css";

export type PosterSize = "a4" | "a5";
export type PosterLang = "en" | "de" | "both";
export type PosterText = { lang: "en" | "de"; headline: string; sub: string; scan: string };

type Props = {
  name: string;
  url: string;
  /** The QR code as an SVG string from features/floor/qr.ts. */
  svg: string;
  size: PosterSize;
  lang: PosterLang;
  /** One entry per language shown, German first. */
  texts: PosterText[];
  /** The screen-only bar: where back goes and the links for size and language. */
  toolbar: { backHref: string; backLabel: string; sizeLabel: string; langLabel: string; sizes: { value: PosterSize; href: string }[]; langs: { value: PosterLang; label: string; href: string }[] };
};

export function AreaPoster({ name, url, svg, size, lang, texts, toolbar }: Props) {
  return (
    <div data-testid="settings-areas-poster-page">
      <nav className={styles.toolbar}>
        <Link href={toolbar.backHref} className={s.soft}>{toolbar.backLabel}</Link>
        <span className={styles.group}>{toolbar.sizeLabel}: {toolbar.sizes.map((z) => (
          <Link key={z.value} href={z.href} aria-current={z.value === size} className={styles.choice}>{z.value.toUpperCase()}</Link>
        ))}</span>
        <span className={styles.group}>{toolbar.langLabel}: {toolbar.langs.map((l) => (
          <Link key={l.value} href={l.href} aria-current={l.value === lang} className={styles.choice}>{l.label}</Link>
        ))}</span>
      </nav>
      <article className={`${styles.sheet} ${size === "a5" ? styles.a5 : styles.a4}`} data-testid="settings-areas-poster" data-size={size}>
        {texts.map((x, i) => (
          <header key={x.lang} lang={x.lang} className={i === 0 ? styles.primary : styles.secondary}>
            <h1 className={styles.headline}>{x.headline}</h1>
            <p className={styles.sub}>{x.sub}</p>
          </header>
        ))}
        <div className={styles.code} role="img" aria-label={url} data-testid="settings-areas-poster-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        {texts.map((x, i) => (
          <p key={x.lang} lang={x.lang} className={i === 0 ? styles.scan : styles.scanSecondary}>{x.scan}</p>
        ))}
        <p className={styles.name} data-testid="settings-areas-poster-name">{name}</p>
        <p className={styles.url} data-testid="settings-areas-poster-url">{url}</p>
      </article>
    </div>
  );
}
