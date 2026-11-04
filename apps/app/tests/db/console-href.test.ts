// Who gets the IT console in their account menu: an active console admin of this one-company stack.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { consoleHrefFor } from "@/lib/db/people";

const db = getDb();
const SLUG = "console-href-co";
const env = { ...process.env };
const ids = { company: "", other: "", admin: "", left: "", plain: "", foreign: "" };

beforeAll(async () => {
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "A", stage: "pilot", seedJson: {} } })).id;
  ids.other = (await db.company.create({ data: { slug: "console-href-other", name: "B", stage: "pilot", seedJson: {} } })).id;
  const user = async (companyId: string, name: string, data: { isStackAdmin?: boolean; active?: boolean } = {}) =>
    (await db.user.create({ data: { companyId, name, email: name + "@console-href.example", role: "member", ...data } })).id;
  ids.admin = await user(ids.company, "admin", { isStackAdmin: true });
  ids.left = await user(ids.company, "left", { isStackAdmin: true, active: false });
  ids.plain = await user(ids.company, "plain");
  ids.foreign = await user(ids.other, "foreign", { isStackAdmin: true });
});

beforeEach(() => {
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
});

afterEach(() => {
  for (const k of ["TENANT_MODE", "COMPANY_SLUG"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("consoleHrefFor", () => {
  it("names the console for an active console admin", async () => {
    expect(await consoleHrefFor(ids.company, ids.admin)).toBe("/admin");
  });

  it("names nothing for someone else, a leaver, or a person of another company", async () => {
    expect(await consoleHrefFor(ids.company, ids.plain)).toBeNull();
    expect(await consoleHrefFor(ids.company, ids.left)).toBeNull();
    expect(await consoleHrefFor(ids.company, ids.foreign)).toBeNull();
  });

  it("names nothing where there is no console: a stack with many companies", async () => {
    process.env.TENANT_MODE = "path";
    delete process.env.COMPANY_SLUG;
    expect(await consoleHrefFor(ids.company, ids.admin)).toBeNull();
  });
});
