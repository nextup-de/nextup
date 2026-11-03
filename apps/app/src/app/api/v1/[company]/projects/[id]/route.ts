// GET /api/v1/[company]/projects/[id] - projects.get.
import { V1Failure, withV1 } from "@/server/api/handle";
import { getProject } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string; id: string }> }) {
  const { company, id } = await params;
  return withV1(request, company, "projects.get", async ({ token }) => {
    const out = await getProject(company, token.companyId, id);
    if (!out) throw new V1Failure("not_found", "No such project.");
    return out;
  });
}
