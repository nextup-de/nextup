// GET /api/v1/[company]/cases/[id] - cases.get.
import { V1Failure, withV1 } from "@/server/api/handle";
import { getCase } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string; id: string }> }) {
  const { company, id } = await params;
  return withV1(request, company, "cases.get", async ({ token }) => {
    const out = await getCase(company, token.companyId, id);
    if (!out) throw new V1Failure("not_found", "No such case.");
    return out;
  });
}
