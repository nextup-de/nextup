// Sign-in and provisioning: Personal codes, Microsoft Entra ID, OIDC, SAML, SCIM and the audit log export.
// Company admins only (companyAdminOf). The page reads; every change goes through server/actions/settings/sign-in.ts.
import { notFound } from "next/navigation";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SignInSettings, type SignInView, type TestView } from "@/components/settings/SignInSettings";
import { SectionCard } from "@/components/ui/elements";
import { holdsRealPeople } from "@/features/admin/stages";
import { certStatus } from "@/features/identity/saml-metadata";
import { parseLogExportSettings, parseOidcSettings, parseSamlSettings, parseScimSettings } from "@/features/identity/settings";
import { cardState, lastTestOf, type CardKind } from "@/features/identity/sign-in-form";
import { companyOrigin, companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
import { exportStatus } from "@/lib/db/audit-export";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration, type IntegrationInfo } from "@/lib/db/integrations";
import { scimActivity, scimTokenInfo, secondFactorCount, userNameOf } from "@/lib/db/sign-in-page";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { oidcCallbackUrl } from "@/server/identity/oidc";
import { samlAcsUrl, samlEntityId } from "@/server/identity/saml";

export async function generateMetadata() {
  return { title: (await getT())("settingsSignIn.navLabel") };
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function testView(companyId: string, row: IntegrationInfo | null, sso: boolean): Promise<TestView | null> {
  const t = lastTestOf(row?.account);
  if (!t) return null;
  // An SSO test stores the user id of the matched person; a failed one stores an error code.
  const name = sso && t.ok ? await userNameOf(companyId, t.detail) : null;
  return { at: t.at, ok: t.ok, detail: t.detail, name };
}

export default async function SignInSettingsPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<{ tested?: string }> }) {
  const { company: slug } = await params;
  const { tested } = await searchParams;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <><SettingsHead title={t("settingsSignIn.title")} /><SectionCard><p>{t("settingsSignIn.noDatabase")}</p></SectionCard></>;
  const admin = await companyAdminOf(slug);
  if (!admin) notFound();
  const id = admin.companyId;
  const now = new Date();
  const co = await getDb().company.findUnique({ where: { id }, select: { name: true, stage: true, entraTenantId: true } });
  if (!co) notFound();
  const demo = !holdsRealPeople(co.stage);
  const origin = companyOrigin(slug);

  const [oidc, saml, scim, logsink, codes, exported] = await Promise.all([
    getIntegration(id, "oidc"), getIntegration(id, "saml"), getIntegration(id, "scim"), getIntegration(id, "logsink"),
    secondFactorCount(id), exportStatus(id, now),
  ]);
  const state = (kind: CardKind, row: IntegrationInfo | null) => cardState(row, { kind, demo }, now);

  const oidcSettings = oidc ? parseOidcSettings(oidc.settings) : null;
  const samlSettings = saml ? parseSamlSettings(saml.settings) : null;
  const scimSettings = scim ? parseScimSettings(scim.settings) : null;
  const logSettings = logsink ? parseLogExportSettings(logsink.settings) : null;
  const token = scimSettings?.ok ? await scimTokenInfo(id, scimSettings.value.tokenId) : null;
  const activity = scim ? await scimActivity(id, now) : { added: 0, updated: 0, deactivated: 0 };

  let cert: SignInView["saml"]["cert"] = null;
  if (samlSettings?.ok && samlSettings.value.certExpiresAt.length > 0) {
    const soonest = [...samlSettings.value.certExpiresAt].sort()[0];
    cert = { expiresAt: soonest, days: Math.floor((new Date(soonest).getTime() - now.getTime()) / DAY_MS), status: certStatus(soonest, now) };
  }

  const view: SignInView = {
    slug, company: co.name, demo, tested: tested === "oidc" || tested === "saml" ? tested : null,
    codes,
    entraTenantId: co.entraTenantId,
    oidc: {
      state: state("oidc", oidc), on: oidc?.on ?? false, saved: oidcSettings?.ok ?? false,
      buttonText: oidcSettings?.ok ? oidcSettings.value.buttonText : "", issuer: oidcSettings?.ok ? oidcSettings.value.issuer : "",
      clientId: oidcSettings?.ok ? oidcSettings.value.clientId : "", scopes: oidcSettings?.ok ? oidcSettings.value.scopes : "openid email profile",
      hasSecret: oidc?.hasSecret ?? false, redirectUrl: oidcCallbackUrl(origin, slug),
      testHref: `${companyPrefix(slug)}/login/oidc?test=1`, test: await testView(id, oidc, true),
    },
    saml: {
      state: state("saml", saml), on: saml?.on ?? false, saved: samlSettings?.ok ?? false,
      buttonText: samlSettings?.ok ? samlSettings.value.buttonText : "", metadataUrl: samlSettings?.ok ? (samlSettings.value.metadataUrl ?? "") : "",
      entityId: samlEntityId(origin, slug), replyUrl: samlAcsUrl(origin, slug), metadataHref: `${companyPrefix(slug)}/login/saml/metadata`,
      cert, testHref: `${companyPrefix(slug)}/login/saml?test=1`, test: await testView(id, saml, true),
    },
    scim: {
      state: state("scim", scim), on: scim?.on ?? false, endpoint: `${origin}/api/scim/${slug}/v2`,
      tokenCreatedAt: token ? token.createdAt.toISOString() : null, lastRequestAt: token?.lastUsedAt ? token.lastUsedAt.toISOString() : null,
      activity,
    },
    logsink: {
      state: state("logsink", logsink), on: logsink?.on ?? false,
      target: logSettings?.ok ? logSettings.value.target : "off",
      host: logSettings?.ok ? (logSettings.value.host ?? "") : "", port: logSettings?.ok && logSettings.value.port !== null ? String(logSettings.value.port) : "6514",
      transport: logSettings?.ok ? (logSettings.value.transport ?? "tls") : "tls", caPem: logSettings?.ok ? (logSettings.value.caPem ?? "") : "",
      fileName: `${process.env.LOG_EXPORT_DIR || "/var/log/nextup"}/audit-YYYY-MM-DD.jsonl`,
      lastOkAt: exported.lastOkAt ? exported.lastOkAt.toISOString() : null, sentToday: exported.sentToday, lastError: exported.lastError,
      test: await testView(id, logsink, false),
    },
  };

  return (
    <>
      <SettingsHead title={t("settingsSignIn.title")} lede={t("settingsSignIn.lead", { company: co.name })} />
      <SignInSettings view={view} />
    </>
  );
}
