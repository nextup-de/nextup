// Reads the four SuccessFactors entities (plan SFX, D3/D5): a full read, or the changes since a watermark.
// Read-only; every request goes through the client, which refuses anything but the allow-listed entities.
import { SF_SELECT, utcDay, type SapRows } from "@/features/directory/successfactors";
import type { SuccessFactorsClient } from "./client";

const CHUNK = 50;
const OVERLAP_MS = 5 * 60_000;

const chunks = <T>(list: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const userFilter = (ids: string[]) => ids.map((id) => `userId eq ${literal(id)}`).join(" or ");
const field = (row: unknown, name: string): string | null => {
  const v = row && typeof row === "object" ? (row as Record<string, unknown>)[name] : null;
  return typeof v === "string" && v ? v : null;
};

export async function readFull(client: SuccessFactorsClient, today: Date): Promise<SapRows> {
  const asOfDate = utcDay(today);
  const users = await client.get("User", { select: SF_SELECT.User });
  const employments = await client.get("EmpEmployment", { select: SF_SELECT.EmpEmployment });
  const jobs = await client.get("EmpJob", { select: SF_SELECT.EmpJob, asOfDate });
  const departments = await client.get("FODepartment", { select: SF_SELECT.FODepartment, asOfDate });
  return { users, employments, jobs, departments };
}

/** `since` is the stored watermark; the read starts five minutes before it. */
export async function readChanges(client: SuccessFactorsClient, since: Date, today: Date): Promise<SapRows> {
  const asOfDate = utcDay(today);
  const filter = `lastModifiedDateTime gt datetimeoffset'${new Date(since.getTime() - OVERLAP_MS).toISOString()}'`;
  const changedEmployments = await client.get("EmpEmployment", { select: SF_SELECT.EmpEmployment, filter });
  const changedJobs = await client.get("EmpJob", { select: SF_SELECT.EmpJob, filter, asOfDate });
  const changedUsers = await client.get("User", { select: SF_SELECT.User, filter });

  const ids = [
    ...new Set(
      [...changedEmployments, ...changedJobs, ...changedUsers].flatMap((r) => {
        const id = field(r, "userId");
        return id ? [id] : [];
      }),
    ),
  ];
  const users: unknown[] = [];
  const employments: unknown[] = [];
  const jobs: unknown[] = [];
  for (const part of chunks(ids, CHUNK)) {
    const f = userFilter(part);
    users.push(...(await client.get("User", { select: SF_SELECT.User, filter: f })));
    employments.push(...(await client.get("EmpEmployment", { select: SF_SELECT.EmpEmployment, filter: f })));
    jobs.push(...(await client.get("EmpJob", { select: SF_SELECT.EmpJob, filter: f, asOfDate })));
  }
  const departments = await client.get("FODepartment", { select: SF_SELECT.FODepartment, asOfDate });

  // Managers who did not change are not in the rows above; their personnel numbers are still needed.
  const have = new Set(ids);
  const managerIds = [
    ...new Set(
      jobs.flatMap((j) => {
        const m = field(j, "managerId");
        return m && m !== "NO_MANAGER" && !have.has(m) ? [m] : [];
      }),
    ),
  ];
  const managerEmployments: unknown[] = [];
  for (const part of chunks(managerIds, CHUNK)) {
    managerEmployments.push(
      ...(await client.get("EmpEmployment", { select: SF_SELECT.EmpEmployment, filter: userFilter(part) })),
    );
  }
  return { users, employments, jobs, departments, managerEmployments };
}
