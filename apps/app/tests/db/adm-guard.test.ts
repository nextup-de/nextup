import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer) }));

import { companyAdminOf } from "@/server/actions/settings/guard";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const slug of ["adm-a", "adm-b"]) {
    const c = await db.company.create({ data: { slug, name: slug, seedJson: {} } });
    const mk = async (key: string, role: string, active = true) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    if (slug === "adm-a") {
      await mk("managerA", "manager");
      await mk("leaderA", "leader");
      await mk("oldManagerA", "manager", false);
    } else {
      await mk("managerB", "manager");
    }
  }
});

beforeEach(() => { viewer = null; });

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM company admin guard", () => {
  it("passes an active manager of the company", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    expect((await companyAdminOf("adm-a"))?.userId).toBe(ids.managerA.userId);
  });

  it("refuses a leader of the company", async () => {
    viewer = asViewer("leaderA", "adm-a", "leader");
    expect(await companyAdminOf("adm-a")).toBeNull();
  });

  it("refuses a deactivated manager", async () => {
    viewer = asViewer("oldManagerA", "adm-a", "manager");
    expect(await companyAdminOf("adm-a")).toBeNull();
  });

  it("refuses a manager of another company", async () => {
    viewer = asViewer("managerB", "adm-b", "manager");
    // getViewerFor("adm-a") is null for a session of B; the mock returns B's viewer to prove the row check too.
    viewer = { ...asViewer("managerB", "adm-b", "manager"), companyId: ids.managerA.companyId };
    expect(await companyAdminOf("adm-a")).toBeNull();
    viewer = null;
    expect(await companyAdminOf("adm-a")).toBeNull();
  });
});
