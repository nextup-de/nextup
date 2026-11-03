import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { open, vaultKey } from "@/features/connectors/vault";
import { getDb } from "@/lib/db/client";
import { subscriptionsOf } from "@/lib/db/webhooks";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getT: async () => (k: string) => k }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import {
  createWebhookAction, deleteWebhookAction, dropOldSecretAction, retryDeliveryAction, rotateSecretAction,
  setWebhooksSendingAction, updateWebhookAction,
} from "@/server/actions/settings/webhooks";
import WebhooksSettingsPage from "@/app/[company]/(app)/settings/webhooks/page";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};
const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});
const row = (companyId: string, key: string, channel: string, status: string, address: string | null = null) =>
  db.outboxMessage.create({ data: { companyId, channel, key, template: "webhook", locale: "en", subject: "case.raised", text: "", status, attempt: 3, lastError: "boom", address, nextAt: new Date("2020-01-01") } });
const audits = (companyId: string) => db.auditEvent.findMany({ where: { companyId, action: "audit.settings.webhooks" }, orderBy: { at: "asc" } });

/** The props the page hands to the Webhooks component. */
async function pageProps(): Promise<{ deliveries: { id: string }[]; sending: boolean; subs: { id: string }[] }> {
  const tree = await WebhooksSettingsPage({ params: Promise.resolve({ company: "api-a" }) });
  const found: Record<string, unknown>[] = [];
  const walk = (n: ReactNode): void => {
    Children.forEach(n, (c) => {
      if (!isValidElement(c)) return;
      const p = c.props as Record<string, unknown>;
      if ("deliveries" in p) found.push(p);
      walk(p.children as ReactNode);
    });
  };
  walk(tree);
  return found[0] as never;
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.AUTH_SECRET ||= "test-secret-for-the-page";
  await db.company.deleteMany({});
  for (const slug of ["api-a", "api-b"]) {
    const c = await db.company.create({ data: { slug, name: slug, mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
    const mk = async (key: string, role: string) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    if (slug === "api-a") { await mk("managerA", "manager"); await mk("leaderA", "leader"); } else await mk("managerB", "manager");
  }
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API webhooks page", () => {
  it("creates a subscription, shows its secret once, rotates, drops the old one, switches off and deletes", async () => {
    viewer = asViewer("managerA", "api-a", "manager");
    const created = await createWebhookAction("api-a", { url: "https://hooks.example.com/in?token=abc", events: ["case.raised", "case.decided"], on: true });
    if (!created.ok || !created.id || !created.secret) throw new Error("create failed");
    expect(created.secret).toMatch(/^whsec_/);
    const stored = await db.webhookSubscription.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.secrets).toHaveLength(1);
    expect(stored.secrets[0]).not.toContain(created.secret);
    expect(open(stored.secrets[0], vaultKey()!, `webhook:${ids.managerA.companyId}`)).toBe(created.secret);

    const rotated = await rotateSecretAction("api-a", created.id);
    if (!rotated.ok || !rotated.secret) throw new Error("rotate failed");
    expect((await subscriptionsOf(ids.managerA.companyId))[0].secrets).toEqual([created.secret, rotated.secret]);
    expect((await rotateSecretAction("api-a", created.id)).ok).toBe(false);
    expect((await dropOldSecretAction("api-a", created.id)).ok).toBe(true);
    expect((await subscriptionsOf(ids.managerA.companyId))[0].secrets).toEqual([rotated.secret]);
    expect((await dropOldSecretAction("api-a", created.id)).ok).toBe(false);

    expect((await updateWebhookAction("api-a", { id: created.id, url: "https://hooks.example.com/in", events: ["case.raised"], on: false })).ok).toBe(true);
    expect(await db.webhookSubscription.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ on: false, events: ["case.raised"] });
    expect(await updateWebhookAction("api-a", { id: created.id, url: "http://x.example", events: ["case.raised"] })).toEqual({ ok: false, error: "settingsWebhooks.errorHttps" });

    expect((await deleteWebhookAction("api-a", created.id)).ok).toBe(true);
    expect(await db.webhookSubscription.count({ where: { companyId: ids.managerA.companyId } })).toBe(0);

    const log = await audits(ids.managerA.companyId);
    expect(log).toHaveLength(5);
    const text = JSON.stringify(log);
    expect(text).not.toContain("whsec_");
    expect(text).not.toContain("token=abc");
    expect(text).not.toContain(rotated.secret);
  });

  it("flips the send switch and audits it", async () => {
    viewer = asViewer("managerA", "api-a", "manager");
    const before = (await audits(ids.managerA.companyId)).length;
    expect((await setWebhooksSendingAction("api-a", true)).ok).toBe(true);
    expect((await db.companyConfig.findUniqueOrThrow({ where: { companyId: ids.managerA.companyId } })).n8n).toBe(true);
    expect((await pageProps()).sending).toBe(true);
    expect((await setWebhooksSendingAction("api-a", false)).ok).toBe(true);
    expect((await db.companyConfig.findUniqueOrThrow({ where: { companyId: ids.managerA.companyId } })).n8n).toBe(false);
    expect((await audits(ids.managerA.companyId)).length).toBe(before + 2);
  });

  it("lists webhook deliveries only and retries a failed one of this company", async () => {
    const a = ids.managerA.companyId;
    const hook = await row(a, "wh1", "webhook", "failed");
    const mail = await row(a, "m1", "mail", "failed");
    const other = await row(ids.managerB.companyId, "wh2", "webhook", "failed");
    viewer = asViewer("managerA", "api-a", "manager");
    expect((await pageProps()).deliveries.map((d) => d.id)).toEqual([hook.id]);

    const before = (await audits(a)).length;
    expect((await retryDeliveryAction("api-a", other.id)).ok).toBe(false);
    expect((await retryDeliveryAction("api-a", mail.id)).ok).toBe(false);
    expect((await retryDeliveryAction("api-a", hook.id)).ok).toBe(true);
    expect(await db.outboxMessage.findUniqueOrThrow({ where: { id: hook.id } })).toMatchObject({ status: "pending", attempt: 0 });
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("failed");
    expect((await audits(a)).length).toBe(before + 1);
  });

  it("refuses a non-admin and changes nothing", async () => {
    const hook = await row(ids.managerA.companyId, "wh3", "webhook", "failed");
    const before = (await audits(ids.managerA.companyId)).length;
    for (const v of [null, asViewer("leaderA", "api-a", "leader")]) {
      viewer = v;
      const forbidden = { ok: false, error: "settingsCompany.forbidden" };
      expect(await createWebhookAction("api-a", { url: "https://x.example", events: ["case.raised"] })).toEqual(forbidden);
      expect(await setWebhooksSendingAction("api-a", true)).toEqual(forbidden);
      expect(await retryDeliveryAction("api-a", hook.id)).toEqual(forbidden);
      await expect(pageProps()).rejects.toThrow("NOT_FOUND");
    }
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: hook.id } })).status).toBe("failed");
    expect(await db.webhookSubscription.count({ where: { companyId: ids.managerA.companyId } })).toBe(0);
    expect((await audits(ids.managerA.companyId)).length).toBe(before);
  });
});
