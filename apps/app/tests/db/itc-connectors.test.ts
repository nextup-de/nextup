// ITC-A1 on the proof database: a console admin of acme stores Jira (Data Center), the AI choice and the
// Microsoft 365 switch for acme only, reads them back without the secret, and sees acme's directory run.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { getIntegration, JIRA } from "@/lib/db/integrations";
import { AI_SYSTEM } from "@/features/ai/settings";
import { m365SearchOn } from "@/lib/db/connections";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";

let via: string = "entra";
let guard: { companyId: string; slug: string } | null = null;
vi.mock("@/server/console-guard", () => ({ consoleCompany: vi.fn(async () => (guard ? { ...guard, via } : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/admin-session", () => ({ adminActor: vi.fn(async () => "console-test") }));
vi.mock("@/server/jira-sync", () => ({ kickJira: vi.fn() }));

import { saveConsoleAi, saveConsoleJira, setConsoleJiraOn, setConsoleM365 } from "@/server/actions/console-connectors";
import { loadConnectors } from "@/app/admin/connectors/load";

const db = getDb();
const SECRET = "pat-secret-value";
const KEY = "ai-secret-key";
let acme = { id: "", slug: "itc-acme" };
let other = { id: "", slug: "itc-other" };
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  saved.CONNECTOR_VAULT_KEY = process.env.CONNECTOR_VAULT_KEY;
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  await db.company.deleteMany({ where: { slug: { in: ["itc-acme", "itc-other"] } } });
  acme = { ...acme, id: (await db.company.create({ data: { slug: acme.slug, name: "Acme", seedJson: {} } })).id };
  other = { ...other, id: (await db.company.create({ data: { slug: other.slug, name: "Other", seedJson: {} } })).id };
  await db.directoryRun.create({ data: { companyId: acme.id, on: true, lastRunAt: new Date("2026-11-01T08:00:00Z") } });
  guard = { companyId: acme.id, slug: acme.slug };
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["itc-acme", "itc-other"] } } });
  process.env.CONNECTOR_VAULT_KEY = saved.CONNECTOR_VAULT_KEY;
  await db.$disconnect();
});

describe("ITC console connectors", () => {
  it("stores Jira (dc) and the AI choice in acme's rows and reads them back without the secret", async () => {
    const jira = await saveConsoleJira({ flavor: "dc", siteUrl: "https://jira.acme.example", email: "", token: SECRET, projectKey: "NUP", epicTypeId: "10", stepTypeId: "11" });
    expect(jira).toEqual({ ok: true });
    const ai = await saveConsoleAi({ choice: "azure-openai", region: "eu", model: "gpt", endpoint: "https://aoai.acme.example", deployment: "d1", key: KEY });
    expect(ai).toEqual({ ok: true });

    const row = await getIntegration(acme.id, JIRA);
    expect(row?.hasSecret).toBe(true);
    expect((row?.settings as { flavor: string }).flavor).toBe("dc");
    expect((await getIntegration(acme.id, AI_SYSTEM))?.hasSecret).toBe(true);
    expect(await getIntegration(other.id, JIRA)).toBeNull();
    expect(await getIntegration(other.id, AI_SYSTEM)).toBeNull();

    const data = await loadConnectors({ companyId: acme.id, slug: acme.slug });
    expect(data.jira.token).toBe("set");
    expect(data.jira.form.flavor).toBe("dc");
    expect(data.ai.key).toBe("set");
    expect(data.ai.choice).toBe("azure-openai");
    const json = JSON.stringify(data);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(KEY);

    expect(await setConsoleJiraOn(true)).toEqual({ ok: true });
    expect((await getIntegration(acme.id, JIRA))?.on).toBe(true);
  });

  it("stores the prices per model with the AI choice, refuses a line that does not read, and shows them back", async () => {
    const base = { choice: "azure-openai", region: "eu", model: "gpt", endpoint: "https://aoai.acme.example", deployment: "d1", key: "" };
    expect(await saveConsoleAi({ ...base, prices: "GPT-4.1-mini 0,42 1.68\nmistral-nemo 0 0" })).toEqual({ ok: true });
    expect((await getIntegration(acme.id, AI_SYSTEM))?.settings).toMatchObject({ prices: { "gpt-4.1-mini": { in: 0.42, out: 1.68 }, "mistral-nemo": { in: 0, out: 0 } } });
    expect((await loadConnectors({ companyId: acme.id, slug: acme.slug })).ai.prices).toBe("gpt-4.1-mini 0.42 1.68\nmistral-nemo 0 0");
    expect(await saveConsoleAi({ ...base, prices: "gpt-4.1-mini 0.42 1.68\ngpt-4.1 two 8" })).toEqual({ ok: false, code: "invalid", detail: "prices, line 2" });
    expect((await getIntegration(acme.id, AI_SYSTEM))?.settings).toMatchObject({ prices: { "mistral-nemo": { in: 0, out: 0 } } });
    expect(await getIntegration(other.id, AI_SYSTEM)).toBeNull();
    // Too long is refused, never cut: a cut inside a number would store a wrong price.
    expect(await saveConsoleAi({ ...base, prices: "gpt-4o 2.5 10" + " ".repeat(5000) })).toEqual({ ok: false, code: "invalid", detail: "prices" });
    // An empty field removes them.
    expect(await saveConsoleAi({ ...base, prices: "" })).toEqual({ ok: true });
    expect((await getIntegration(acme.id, AI_SYSTEM))?.settings).toMatchObject({ prices: null });
    expect((await loadConnectors({ companyId: acme.id, slug: acme.slug })).ai.prices).toBe("");
  });

  it("flips the Microsoft 365 switch for acme only", async () => {
    expect(await setConsoleM365(true)).toEqual({ ok: true });
    expect(await m365SearchOn(acme.id)).toBe(true);
    expect(await m365SearchOn(other.id)).toBe(false);
    expect(await setConsoleM365(false)).toEqual({ ok: true });
    expect(await m365SearchOn(acme.id)).toBe(false);
  });

  it("shows acme's directory run", async () => {
    const data = await loadConnectors({ companyId: acme.id, slug: acme.slug });
    expect(data.directory.on).toBe(true);
    expect(data.directory.lastRunAt).toBe("2026-11-01T08:00:00.000Z");
    const none = await loadConnectors({ companyId: other.id, slug: other.slug });
    expect(none.directory.lastRunAt).toBeNull();
  });

  it("refuses a support session and a missing guard", async () => {
    via = "support";
    expect(await setConsoleM365(true)).toEqual({ ok: false, code: "support-read-only" });
    expect(await m365SearchOn(acme.id)).toBe(false);
    via = "entra";
    guard = null;
    expect(await saveConsoleAi({ choice: "off" })).toEqual({ ok: false, code: "not-allowed" });
    guard = { companyId: acme.id, slug: acme.slug };
  });

  it("has no connectors section in /settings", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.key)).not.toContain("connectors");
  });
});
