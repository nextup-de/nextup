// GET /api/scim/[company]/v2/Schemas (EID-S1, D10).
import { SCHEMAS } from "@/features/scim";
import { withScim } from "@/server/scim/handle";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, async () => SCHEMAS);
}
