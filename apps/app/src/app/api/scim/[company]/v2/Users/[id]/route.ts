// GET, PUT, PATCH and DELETE /api/scim/[company]/v2/Users/[id] (EID-S1, D10). DELETE deactivates.
import { jsonBody, withScim } from "@/server/scim/handle";
import { deleteUser, getUser, patchUser, replaceUser } from "@/server/scim/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string; id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { company, id } = await params;
  return withScim(request, company, ({ token }) => getUser(token.companyId, id));
}

export async function PUT(request: Request, { params }: Ctx) {
  const { company, id } = await params;
  return withScim(request, company, async ({ token }) => replaceUser(token, id, await jsonBody(request)));
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { company, id } = await params;
  return withScim(request, company, async ({ token }) => patchUser(token, id, await jsonBody(request)));
}

export async function DELETE(request: Request, { params }: Ctx) {
  const { company, id } = await params;
  return withScim(request, company, async ({ token }) => {
    await deleteUser(token, id);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  });
}
