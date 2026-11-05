// A throwaway company for the DB specs, written straight to the database. /admin no longer creates
// companies (ITC-C1, D5: platform functions left the app), so the specs make theirs here, with the
// same rows the old create form wrote, and delete it again at the end.
import { toSeedJson } from "../../../src/features/demo/parse";
import { templateWrites } from "../../../src/features/demo/content";
import { generateLoginCode, hashLoginCode } from "../../../src/features/auth/login-code";
import { needsHandle, newHandle } from "../../../src/features/auth/handle";
import { initialsOf, markFor, type NewCompany, type NewPerson } from "../../../src/features/tenant/create";
import { getDb } from "../../../src/lib/db/client";
import { bindDemoCompany } from "../../../src/lib/db/demo-identity";
import { writeStructure } from "../../../src/lib/db/structure-writes";

type Stage = "demo" | "sandbox" | "pilot";

/** Create a company with its people; returns each person's login code by name. */
export async function createTestCompany(
  // Open from the start unless `closed`: most specs are about what happens after "Open NextUp".
  input: Omit<NewCompany, "people" | "mark"> & { stage: Stage; people: readonly NewPerson[]; closed?: boolean },
): Promise<Map<string, string>> {
  const db = getDb();
  const people = input.people.map((p) => ({ ...p }));
  const writes = templateWrites(input.template, () => crypto.randomUUID());
  const now = new Date();
  const codes = new Map<string, string>();
  const handles: string[] = [];
  for (const p of people) {
    if (needsHandle(p.role) && !p.handle) { p.handle = newHandle(handles); handles.push(p.handle); }
    codes.set(p.name, generateLoginCode(input.slug));
  }
  const company = await db.company.create({
    data: {
      slug: input.slug,
      name: input.name,
      mark: markFor({ name: input.name }),
      stage: input.stage,
      openedAt: input.closed ? null : now,
      seedJson: toSeedJson(writes.seedJson) as object,
      config: { create: {} },
      users: {
        create: people.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim().toLowerCase(),
          role: p.role,
          dept: p.dept ?? "",
          ini: initialsOf(p.name),
          handle: p.handle ?? null,
          loginCodeHash: hashLoginCode(codes.get(p.name) ?? ""),
          loginCodeAt: now,
        })),
      },
    },
  });
  if (input.template === "demo") {
    await writeStructure(company.id, writes, "admin");
    await bindDemoCompany(company.id);
  }
  return codes;
}

export async function deleteTestCompany(slug: string): Promise<void> {
  await getDb().company.deleteMany({ where: { slug } });
}

export const emailOf = (name: string, slug: string) => `${name.replace(/\W+/g, ".").toLowerCase()}@${slug}.test`;
