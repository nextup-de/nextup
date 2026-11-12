// API v1 case creation (API-B1, D9): POST /api/v1/<company>/cases raises a case for the company system. The same
// steps the app's raise runs (server/actions/events.ts): the seat from the route (stampEvent), the proposal from
// the brain or the keywords (proposeOnRaise). The actor is system:api, never a person (D3).
import { createHash, randomUUID } from "node:crypto";
import type { ApiV1CaseCreate, CaseRef } from "@nextup/contracts/public";
import type { EventPayload } from "@/features/cases/events";
import { raiserDept, stampEvent } from "@/features/cases/stamp";
import { seedFor } from "@/features/demo";
import { getDb } from "@/lib/db/client";
import { appendEventRow, hasIdemKey } from "@/lib/db/events";
import { loadUnitPeople } from "@/lib/db/pseudonymise";
import { V1Failure } from "@/server/api/handle";
import { getCase } from "@/server/api/read";
import { proposeOnRaise } from "@/server/routing";

export const API_ACTOR = "system:api";
export const API_SOURCE = "api";

/** The ids a caller's externalId maps to (D9): the same externalId is always the same case. */
function idsFor(companyId: string, externalId: string | null): { eventId: string; caseId: string; idemKey: string | null } {
  if (externalId === null) {
    const rand = randomUUID().replace(/-/g, "").slice(0, 24);
    return { eventId: `e_api_${companyId}_${rand}`, caseId: `c_api_${rand}`, idemKey: null };
  }
  const hex = createHash("sha256").update(externalId).digest("hex").slice(0, 24);
  return { eventId: `e_api_${companyId}_${hex}`, caseId: `c_api_${hex}`, idemKey: `api:${externalId}` };
}

export async function createCase(
  slug: string,
  companyId: string,
  body: ApiV1CaseCreate,
): Promise<{ status: 201 | 200; data: CaseRef }> {
  const { eventId, caseId, idemKey } = idsFor(companyId, body.externalId);

  const existing = async (status: 200): Promise<{ status: 200; data: CaseRef }> => {
    const found = await getCase(slug, companyId, caseId);
    if (!found) throw new Error(`case ${caseId} is missing after its create`);
    return { status, data: found.data };
  };

  // A repeat is answered before anything else is checked or written.
  if (idemKey !== null && (await hasIdemKey(companyId, idemKey))) return existing(200);

  let fromDept = "";
  if (body.raisedByUserId !== null) {
    const user = await getDb().user.findFirst({ where: { id: body.raisedByUserId, companyId, active: true }, select: { id: true, dept: true } });
    if (!user) throw new V1Failure("bad_request", "raisedByUserId: no active user of this company has this id.");
    // The raiser's department, as the web raise names it. system:api does not name them, so a small unit's is left out.
    fromDept = raiserDept(user.dept, { label: API_ACTOR, userId: user.id }, await loadUnitPeople(companyId));
  }

  const seed = await seedFor(slug);
  const base: EventPayload = {
    title: body.title,
    body: body.body,
    kind: body.kind,
    fromDept,
    visibility: "everyone",
  };
  const proposal = await proposeOnRaise(slug, companyId, base);
  const hinted = body.routeHint !== null && seed.routes.some((r) => r.id === body.routeHint) ? body.routeHint : null;
  const stamped = stampEvent("case.raised", { ...base, routeId: hinted ?? proposal.routeId }, seed, { raiserUserId: body.raisedByUserId });

  const result = await appendEventRow(
    companyId,
    { id: eventId, day: 0, type: "case.raised", actor: API_ACTOR, targetId: caseId, payload: { ...stamped, proposal } },
    { actorUserId: body.raisedByUserId, source: API_SOURCE, idemKey },
  );
  if (!result.ok) throw new Error(result.error);
  if (result.duplicate) return existing(200); // lost a race with the same externalId

  const created = await getCase(slug, companyId, caseId);
  if (!created) throw new Error(`case ${caseId} is missing after its create`);
  return { status: 201, data: created.data };
}
