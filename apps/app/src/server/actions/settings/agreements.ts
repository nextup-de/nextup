"use server";
// /<company>/settings/go-live: the Agreements card (Q9.4). A company admin records each agreement signed
// outside the software, or that it is not needed. The company id is the guard's, never the form's. A refusal
// is a reason, not a text: the card picks the message.
import { revalidatePath } from "next/cache";
import { parseAgreement, type AgreementError, type AgreementInput } from "@/features/pilot/agreements";
import { companyPrefix } from "@/features/tenant/urls";
import { recordAgreement } from "@/lib/db/agreements";
import { revalidateSetup } from "@/server/setup-paths";
import { companyAdminOf } from "./guard";

export type AgreementResult = { ok: true } | { ok: false; reason: AgreementError | "forbidden" | "failed" };

export async function recordAgreementAction(slug: string, input: AgreementInput): Promise<AgreementResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, reason: "forbidden" };
  const parsed = parseAgreement(input, new Date());
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  try {
    await recordAgreement(viewer.companyId, viewer.userId, parsed.fields);
  } catch {
    return { ok: false, reason: "failed" };
  }
  revalidatePath(`${companyPrefix(slug)}/settings/go-live`);
  revalidateSetup(); // the Open step and the overview count the check
  return { ok: true };
}
