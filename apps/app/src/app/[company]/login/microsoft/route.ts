// "Continue with Microsoft", step 1: off to the company's Microsoft sign-in.
// Thin on purpose - the flow is src/server/microsoft-login.ts.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/features/auth/request";
import { companyOrigin } from "@/features/tenant/urls";
import { startMicrosoftLogin } from "@/server/microsoft-login";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  // Next decodes the segment, so /%2Fevil.com/... arrives as "/evil.com" - and a redirect built
  // from it would leave the site. Only a real company name gets any further.
  if (!isValidSlug(company)) return new NextResponse(null, { status: 404 });
  // ?as=admin: the company's /admin. ?as=connect: "Connect Microsoft 365" from the profile page.
  const as = request.nextUrl.searchParams.get("as");
  // The public origin, not the request's: behind the box's proxy that is https://0.0.0.0:3000.
  const origin = companyOrigin(company);
  const to = await startMicrosoftLogin(
    company,
    origin,
    request.nextUrl.searchParams.get("next"),
    as === "admin" || as === "connect" ? as : undefined,
  );
  return NextResponse.redirect(new URL(to, origin));
}
