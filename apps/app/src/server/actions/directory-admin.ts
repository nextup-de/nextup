"use server";
// The console's directory block (plan DIR, SFX-C1, D10): the switch, the source and "Run now". Through the
// console guard: the guard's company only, and a read-only support session is refused. The cursor and any
// employeeId stay on the server (D5).
import { revalidatePath } from "next/cache";
import { adminBase } from "@/features/admin/nav";
import { sourceKind } from "@/features/directory";
import { loadDirectoryRun, setDirectoryOn } from "@/lib/db/directory-run";
import { getDb } from "@/lib/db/client";
import { adminActor } from "@/server/admin-session";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { consoleWrite } from "@/server/console-write";
import { runDirectoryCompany } from "@/server/directory/sync";
import type { ConsoleConnectorState } from "@/server/actions/console-connectors";

const refresh = () => revalidatePath(adminBase() + "/connectors");

const door = consoleWrite;

/** Switch the sync on or off and choose its source. Saving releases any lease. */
export async function setDirectoryAction(on: boolean, source: string): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const { companyId, slug } = d.c;
  const actor = await consoleActor();
  const by = (await adminActor()) ?? "admin code";
  const kind = sourceKind(source);
  await getDb().$transaction(async (tx) => {
    await setDirectoryOn(companyId, on === true, kind, by, tx);
    await recordAudit(companyId, { actor, action: on === true ? "audit.directory.on" : "audit.directory.off", target: { kind: "directory", id: kind }, source: "console" }, tx);
  });
  console.info(`[directory-admin] switched ${on === true ? "on" : "off"} ${slug}`);
  refresh();
  return { ok: true };
}

/** Run a round for this company now (the default source for its setting) instead of waiting for the interval. */
export async function runDirectoryNowAction(): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  if (!(await loadDirectoryRun(d.c.companyId))?.on) return { ok: false, code: "switch-on-first" };
  await runDirectoryCompany({ id: d.c.companyId, slug: d.c.slug });
  refresh();
  return { ok: true };
}
