"use server";
// The /contact form's submit. A real request is saved as a PilotRequest row and shows up in
// /admin; with no database configured the form falls back to the visitor's own mail program,
// which is what it did before there was a backend.
//
// "Real" means two things: the same checks the client ran (src/features/pilot/request.ts) pass
// again here, because the client is not trusted; and the honeypot field is empty, because a
// form-filling bot fills every field it can see. A bot's submit gets a friendly "sent" back and
// no row - telling it what went wrong would only teach it.
import { LEGAL } from "@/config/site";
import {
  pilotMailto,
  readPilotRequest,
  validatePilotRequest,
  type PilotErrors,
  type PilotRequest,
} from "@/features/pilot/request";
import { getDb, hasDatabase } from "@/lib/db/client";
import { clientKey, throttle } from "@/server/throttle";

export type PilotState =
  | { status: "idle" }
  | { status: "invalid"; errors: PilotErrors; values: PilotRequest }
  | { status: "sent"; email: string }
  | { status: "mailto"; href: string }
  | { status: "failed"; values: PilotRequest };

// The honeypot. Visually hidden on the form, named to look worth filling.
const HONEYPOT = "website";

export async function requestPilot(_prev: PilotState, form: FormData): Promise<PilotState> {
  const values = readPilotRequest(form);
  const errors = validatePilotRequest(values);
  if (Object.keys(errors).length > 0) return { status: "invalid", errors, values };

  if (String(form.get(HONEYPOT) ?? "").trim() !== "") {
    console.info("[pilot] dropped a request that filled the honeypot");
    return { status: "sent", email: values.email };
  }

  if (!hasDatabase()) return { status: "mailto", href: pilotMailto(LEGAL.email, values) };

  // A public form that writes rows: a handful per address per hour, so a script cannot fill the
  // table. "failed" keeps what they typed and offers the mail address - a real person is not stuck.
  if (throttle("pilotRequest", await clientKey())) return { status: "failed", values };

  try {
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
    return { status: "sent", email: values.email };
  } catch (err) {
    console.error("[pilot] could not save a request", err);
    return { status: "failed", values };
  }
}
