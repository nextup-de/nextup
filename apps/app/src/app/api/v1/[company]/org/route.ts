// GET /api/v1/[company]/org - org.get.
import { withV1 } from "@/server/api/handle";
import { getOrg } from "@/server/api/read";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withV1(request, company, "org.get", async ({ token }) => getOrg(token.companyId));
}
