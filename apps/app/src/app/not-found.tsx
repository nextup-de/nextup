import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main style={{ minHeight: "var(--nh-screen-h)", display: "grid", placeItems: "center", padding: "var(--nh-page-x)", background: "var(--nh-surface)" }}>
      <div style={{ display: "grid", gap: 14, justifyItems: "start", maxWidth: 480 }}>
        <p className="nh-eyebrow">{t("errors.notFoundEyebrow")}</p>
        <h1 style={{ fontSize: "var(--nh-fs-4xl)", fontWeight: 800 }}>{t("errors.notFoundTitle")}</h1>
        <p style={{ color: "var(--nh-ink-2)" }}>{t("errors.notFoundText")}</p>
        <Button href="/">{t("errors.notFoundBack", { site: SITE.name })}</Button>
      </div>
    </main>
  );
}
