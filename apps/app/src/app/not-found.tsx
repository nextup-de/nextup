import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";

export default function NotFound() {
  return (
    <main style={{ minHeight: "var(--nh-screen-h)", display: "grid", placeItems: "center", padding: "var(--nh-page-x)", background: "var(--nh-surface)" }}>
      <div style={{ display: "grid", gap: 14, justifyItems: "start", maxWidth: 480 }}>
        <p className="nh-eyebrow">404 · nobody owns this page</p>
        <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 800 }}>Page not found</h1>
        <p style={{ color: "var(--nh-ink-2)" }}>The address has no owner in our routing table. Back to the start, or <Link href="/contact" style={{ fontWeight: 600, textDecoration: "underline" }}>tell us</Link> what you were looking for.</p>
        <Button href="/">Back to {SITE.name}</Button>
      </div>
    </main>
  );
}
