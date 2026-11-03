// The printable QR poster of one area (FLR D13): ?size=a4|a5, ?lang=en|de|both. Admin only.
import { notFound } from "next/navigation";
import { AreaPoster, type PosterLang, type PosterSize, type PosterText } from "@/components/settings/AreaPoster";
import { areaUrl } from "@/features/floor/areas";
import { areaQrSvg } from "@/features/floor/qr";
import { companyPrefix } from "@/features/tenant/urls";
import { createT, type Locale } from "@/i18n";
import { getT } from "@/i18n/server";
import { findArea } from "@/lib/db/floor";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { companyBaseUrl } from "@/server/case-notice";

type Query = { size?: string | string[]; lang?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata() {
  return { title: (await getT())("settingsAreas.poster") };
}

export default async function AreaPosterPage({ params, searchParams }: { params: Promise<{ company: string; key: string }>; searchParams: Promise<Query> }) {
  const [{ company, key }, query] = await Promise.all([params, searchParams]);
  const t = await getT();
  const admin = await companyAdminOf(company);
  if (!admin) return <p className="nh-hint">{t("settings.membersManagerOnly")}</p>;
  const area = await findArea(admin.companyId, key);
  if (!area) notFound();

  const size: PosterSize = one(query.size) === "a5" ? "a5" : "a4";
  const lang: PosterLang = one(query.lang) === "en" ? "en" : one(query.lang) === "de" ? "de" : "both";
  const url = areaUrl(companyBaseUrl(company), area.key);
  const svg = await areaQrSvg(url);
  const langs: Locale[] = lang === "both" ? ["de", "en"] : [lang];
  const texts: PosterText[] = langs.map((l) => {
    const tl = createT(l);
    return { lang: l, headline: tl("settingsAreas.posterHeadline"), sub: tl("settingsAreas.posterSub"), scan: tl("settingsAreas.posterScan") };
  });
  const prefix = companyPrefix(company);
  const here = (s: PosterSize, l: PosterLang) => `${prefix}/settings/areas/${area.key}/poster?size=${s}&lang=${l}`;
  return (
    <AreaPoster
      name={area.name}
      url={url}
      svg={svg}
      size={size}
      lang={lang}
      texts={texts}
      toolbar={{
        backHref: `${prefix}/settings/areas`,
        backLabel: t("settingsAreas.posterBack"),
        sizeLabel: t("settingsAreas.posterSize"),
        langLabel: t("settingsAreas.posterLang"),
        sizes: (["a4", "a5"] as const).map((s) => ({ value: s, href: here(s, lang) })),
        langs: [
          { value: "both", label: t("settingsAreas.langBoth"), href: here(size, "both") },
          { value: "de", label: t("settingsAreas.langDe"), href: here(size, "de") },
          { value: "en", label: t("settingsAreas.langEn"), href: here(size, "en") },
        ],
      }}
    />
  );
}
