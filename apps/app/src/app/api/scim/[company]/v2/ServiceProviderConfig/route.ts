// GET /api/scim/[company]/v2/ServiceProviderConfig (EID-S1, D10).
import { SERVICE_PROVIDER_CONFIG } from "@/features/scim";
import { withScim } from "@/server/scim/handle";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, async () => SERVICE_PROVIDER_CONFIG);
}
