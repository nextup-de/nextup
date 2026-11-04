// TMS-G1 (D5, D16, D17): the TeamsConversation table and its helpers.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { conversationOf, removeConversation, saveConversation, teamsUserIds } from "@/lib/db/teams";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const db = getDb();
const co = { a: { id: "", slug: "tms-t-a" }, b: { id: "", slug: "tms-t-b" } };
const conv = (n: string) => ({ userId: "u-" + n, aadObjectId: "aad-" + n, tenantId: "t-1", conversationId: "c-" + n, serviceUrl: "https://smba.example/" });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [co.a.slug, co.b.slug] } } });
  for (const c of [co.a, co.b]) c.id = (await db.company.create({ data: { slug: c.slug, name: c.slug, seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
});
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [co.a.slug, co.b.slug] } } });
  await db.$disconnect();
});

describe("TMS tables", () => {
  it("keeps one row per company and user and updates in place", async () => {
    const first = await saveConversation(co.a.id, conv("1"));
    const again = await saveConversation(co.a.id, { ...conv("1"), conversationId: "c-new" });
    expect(again.id).toBe(first.id);
    expect(again.conversationId).toBe("c-new");
    expect(await db.teamsConversation.count({ where: { companyId: co.a.id, userId: "u-1" } })).toBe(1);
    expect((await conversationOf(co.a.id, "u-1"))?.conversationId).toBe("c-new");
  });

  it("returns only the company's own rows", async () => {
    await saveConversation(co.a.id, conv("2"));
    await saveConversation(co.b.id, conv("1"));
    expect(await teamsUserIds(co.a.id)).toEqual(new Set(["u-1", "u-2"]));
    expect(await teamsUserIds(co.b.id)).toEqual(new Set(["u-1"]));
    expect(await conversationOf(co.b.id, "u-2")).toBeNull();
    await removeConversation(co.a.id, "u-2");
    expect(await teamsUserIds(co.a.id)).toEqual(new Set(["u-1"]));
    expect(await teamsUserIds(co.b.id)).toEqual(new Set(["u-1"]));
  });

  it("deletes the rows with the company", async () => {
    await db.company.delete({ where: { id: co.b.id } });
    expect(await db.teamsConversation.count({ where: { companyId: co.b.id } })).toBe(0);
    expect(await db.teamsConversation.count({ where: { companyId: co.a.id } })).toBe(1);
  });

  it("lists the teams section after apiTokens, labelled in both catalogs", () => {
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(keys.indexOf("teams")).toBe(keys.indexOf("apiTokens") + 3);
    const s = SETTINGS_SECTIONS.find((x) => x.key === "teams")!;
    expect(s.path).toBe("teams");
    expect(s.label).toBe("settingsTeams.navLabel");
    expect(en.settingsTeams.navLabel).toBeTruthy();
    expect(de.settingsTeams.navLabel).toBeTruthy();
    expect(en.teams.notSetUp).toBeTruthy();
    expect(de.teams.notSetUp).toBeTruthy();
  });
});
