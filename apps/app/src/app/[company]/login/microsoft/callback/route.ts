// "Continue with Microsoft", step 2: Microsoft sends the person back here with a code.
// Thin on purpose - the flow is src/server/microsoft-login.ts.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/features/auth/request";
import { finishMicrosoftLogin } from "@/server/microsoft-login";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  // Next decodes the segment, so /%2Fevil.com/... arrives as "/evil.com" - and a redirect built
  // from it would leave the site. Only a real company name gets any further.
  if (!isValidSlug(company)) return new NextResponse(null, { status: 404 });
  const to = await finishMicrosoftLogin(company, request.nextUrl.origin, request.nextUrl.searchParams);
  return NextResponse.redirect(new URL(to, request.nextUrl.origin));
}
