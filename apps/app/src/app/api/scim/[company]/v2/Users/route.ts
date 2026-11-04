// GET (list, filter) and POST /api/scim/[company]/v2/Users (EID-S1, D10).
import { jsonBody, scimJson, withScim } from "@/server/scim/handle";
import { createUser, listUsers } from "@/server/scim/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, ({ token }) => listUsers(token.companyId, new URL(request.url).searchParams));
}

export async function POST(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, async ({ token }) => scimJson(await createUser(token, await jsonBody(request)), 201));
}
