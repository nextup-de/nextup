// SAML sign-in, step 2: the identity provider POSTs the signed response here.
// Thin on purpose - the flow is src/server/identity/saml.ts.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/features/auth/request";
import { companyOrigin } from "@/features/tenant/urls";
import { finishSamlLogin } from "@/server/identity/saml";

type Ctx = { params: Promise<{ company: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  if (!isValidSlug(company)) return new NextResponse(null, { status: 404 });
  const origin = companyOrigin(company);
  const form: Record<string, string> = {};
  try {
    for (const [k, v] of (await request.formData()).entries()) if (typeof v === "string") form[k] = v;
  } catch {
    // not a form: handled below as an empty one
  }
  const to = await finishSamlLogin(company, origin, form);
  // 303: the browser follows a POST with a GET.
  return NextResponse.redirect(new URL(to, origin), 303);
}
