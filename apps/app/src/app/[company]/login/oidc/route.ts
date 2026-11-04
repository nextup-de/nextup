// OpenID Connect sign-in, step 1: off to the company's identity provider.
// Thin on purpose - the flow is src/server/identity/oidc.ts.
import { NextResponse, type NextRequest } from "next/server";
import { getViewerFor } from "@/features/auth/session";
import { isValidSlug } from "@/features/auth/request";
import { companyOrigin } from "@/features/tenant/urls";
import { startOidcLogin } from "@/server/identity/oidc";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  if (!isValidSlug(company)) return new NextResponse(null, { status: 404 });
  const origin = companyOrigin(company);
  // ?test=1 starts a test, and only for a company admin's session; for anyone else it is ignored.
  let test = false;
  if (request.nextUrl.searchParams.get("test") === "1") {
    const viewer = await getViewerFor(company);
    test = viewer?.role === "manager";
  }
  const to = await startOidcLogin(company, request.nextUrl.searchParams.get("next"), test);
  return NextResponse.redirect(new URL(to, origin));
}
