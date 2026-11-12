// The agreements of Go-live (Q9.4), read from and written as audit rows: there is no table of their own. The
// retention run keeps these rows (features/privacy/retention.ts, AUDIT_KEPT_ACTIONS), since they are state.
import { AGREEMENT_ACTION, agreementsFrom, type AgreementFields, type Agreements } from "@/features/pilot/agreements";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { listAudit } from "./audit";

/** Five kinds, each recorded a few times at most: 200 rows reach far back enough. */
export async function loadAgreements(companyId: string): Promise<Agreements> {
  return agreementsFrom(await listAudit(companyId, { take: 200, actions: [AGREEMENT_ACTION] }));
}

export async function recordAgreement(companyId: string, byUserId: string, fields: AgreementFields): Promise<void> {
  await recordAudit(companyId, {
    actor: settingsActor({ userId: byUserId }), action: AGREEMENT_ACTION, target: { kind: "agreement", id: fields.kind },
    changes: { ...fields }, source: "settings",
  });
}
