// OpenID Connect sign-in, step 2: the provider sends the person back here with a code.
// Thin on purpose - the flow is src/server/identity/oidc.ts.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/features/auth/request";
import { companyOrigin } from "@/features/tenant/urls";
import { finishOidcLogin } from "@/server/identity/oidc";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  if (!isValidSlug(company)) return new NextResponse(null, { status: 404 });
  const origin = companyOrigin(company);
  const to = await finishOidcLogin(company, origin, request.nextUrl.searchParams);
  return NextResponse.redirect(new URL(to, origin));
}
