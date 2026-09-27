// Saving a pilot request - shared by the in-app /contact action and the intake route the public
// site forwards to, so both write the same row.
import type { PilotRequest } from "@/features/pilot/request";
import { getDb } from "@/lib/db/client";

export async function savePilotRequest(values: PilotRequest): Promise<string> {
  const row = await getDb().pilotRequest.create({
    data: {
      name: values.name,
      company: values.company,
      email: values.email,
      decision: values.decision,
      council: values.council,
      message: values.message,
    },
    select: { id: true },
  });
  // The server log is the second copy: if the database row is ever lost, the request is not.
  console.info(`[pilot] request ${row.id} from ${values.email} (${values.company}): ${values.decision}`);
  return row.id;
}
