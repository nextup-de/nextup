// Our SAML service provider metadata, for the identity provider's admin. Served while the row exists,
// on or off, so it can be handed over before the switch is turned on.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/features/auth/request";
import { spMetadata } from "@/features/identity/saml-metadata";
import { companyOrigin } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { samlAcsUrl, samlEntityId } from "@/server/identity/saml";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  if (!isValidSlug(company) || !hasDatabase()) return new NextResponse(null, { status: 404 });
  const found = await getDb().company.findUnique({ where: { slug: company }, select: { id: true } });
  if (!found || !(await getIntegration(found.id, "saml"))) return new NextResponse(null, { status: 404 });
  const origin = companyOrigin(company);
  const xml = spMetadata({ entityId: samlEntityId(origin, company), acsUrl: samlAcsUrl(origin, company) });
  return new NextResponse(xml, { headers: { "content-type": "application/samlmetadata+xml; charset=utf-8" } });
}
