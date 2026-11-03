// GET /api/v1/[company]/cases - cases.list; POST - cases.create (API-B1).
import type { ApiV1CaseCreate, ApiV1CaseCreated, ApiV1ListQuery } from "@nextup/contracts/public";
import { createCase } from "@/server/api/create";
import { endpointOf, parseBody, parseQuery, V1Failure, withV1 } from "@/server/api/handle";
import { listCases } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withV1(request, company, "cases.list", async ({ token }) => {
    const query = parseQuery<ApiV1ListQuery>(endpointOf("cases.list"), request.url);
    const out = await listCases(company, token.companyId, query);
    if (!out) throw new V1Failure("not_found", "No such company.");
    return out;
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withV1(request, company, "cases.create", async ({ token }) => {
    const body = await parseBody<ApiV1CaseCreate>(endpointOf("cases.create"), request);
    const { status, data } = await createCase(company, token.companyId, body);
    const out: ApiV1CaseCreated = { data };
    return Response.json(out, { status });
  });
}
