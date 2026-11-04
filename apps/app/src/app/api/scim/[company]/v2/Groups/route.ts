// Groups are not stored (EID Q1): every Groups request is a SCIM 404 after the usual checks.
import { ScimFailure } from "@/features/scim";
import { withScim } from "@/server/scim/handle";

export const dynamic = "force-dynamic";

const none = async (): Promise<never> => {
  throw new ScimFailure(404, null, "Groups are not supported.");
};

export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, none);
}

export async function POST(request: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  return withScim(request, company, none);
}
