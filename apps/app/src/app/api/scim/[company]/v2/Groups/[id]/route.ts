// Groups are not stored (EID Q1): every Groups/{id} request is a SCIM 404 after the usual checks.
import { ScimFailure } from "@/features/scim";
import { withScim } from "@/server/scim/handle";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string; id: string }> };

const none = async (): Promise<never> => {
  throw new ScimFailure(404, null, "Groups are not supported.");
};

async function any(request: Request, { params }: Ctx) {
  const { company } = await params;
  return withScim(request, company, none);
}

export const GET = any;
export const PUT = any;
export const PATCH = any;
export const DELETE = any;
