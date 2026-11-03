// GET /api/v1/[company]/projects - projects.list.
import type { ApiV1ListQuery } from "@nextup/contracts/public";
import { endpointOf, parseQuery, V1Failure, withV1 } from "@/server/api/handle";
import { listProjects } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withV1(request, company, "projects.list", async ({ token }) => {
    const query = parseQuery<ApiV1ListQuery>(endpointOf("projects.list"), request.url);
    const out = await listProjects(company, token.companyId, query);
    if (!out) throw new V1Failure("not_found", "No such company.");
    return out;
  });
}
