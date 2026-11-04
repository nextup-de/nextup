// GET /api/scim/[company]/v2/ResourceTypes (EID-S1, D10): User only.
import { RESOURCE_TYPES } from "@/features/scim";
import { withScim } from "@/server/scim/handle";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, async () => RESOURCE_TYPES);
}
