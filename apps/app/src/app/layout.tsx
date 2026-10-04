import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE } from "@/config/site";
import "./globals.css";

// Fonts are committed in ./fonts (latin subset, SIL Open Font License) and served from this origin.
// No request ever goes to Google - not from a visitor's browser (GDPR, LG München I, 3 O 17493/20) and not from
// the build either: next/font/google downloads at build time, and a failed download broke CI and image builds.
const sans = localFont({ src: "./fonts/manrope-var.woff2", weight: "400 800", variable: "--font-sans", display: "swap" });
const mono = localFont({
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500" },
    { path: "./fonts/plex-mono-600.woff2", weight: "600" },
  ],
  variable: "--font-mono", display: "swap",
});
const serif = localFont({ src: "./fonts/instrument-serif-400.woff2", weight: "400", variable: "--font-serif", display: "swap" }); // headings on the raise page
const inter = localFont({ src: "./fonts/inter-var.woff2", weight: "400 700", variable: "--font-inter", display: "swap", preload: false }); // the inbox card and idea detail only

export const metadata: Metadata = {
  title: { default: `${SITE.name} - ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
