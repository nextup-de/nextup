import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_AI_SCRIPT } from "@/config/demo-ai-script";
import { ROUTES } from "@/features/demo/seed";
import { propose } from "@/features/routing";

type EvalCase = { id: string; lang: string; text: string; route_id: string };

const cases: EvalCase[] = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../services/brain/eval/routing_cases.json"), "utf8")
);

describe("AID demo script", () => {
  it("has 6 entries, 3 German and 3 English, 4+ routes, 3+ offline-safe", () => {
    expect(DEMO_AI_SCRIPT).toHaveLength(6);
    expect(DEMO_AI_SCRIPT.filter((q) => q.lang === "de")).toHaveLength(3);
    expect(DEMO_AI_SCRIPT.filter((q) => q.lang === "en")).toHaveLength(3);
    expect(new Set(DEMO_AI_SCRIPT.map((q) => q.routeId)).size).toBeGreaterThanOrEqual(4);
    expect(DEMO_AI_SCRIPT.filter((q) => q.offlineSafe).length).toBeGreaterThanOrEqual(3);
  });

  it("matches the cases of the brain's routing eval set", () => {
    for (const q of DEMO_AI_SCRIPT) {
      const c = cases.find((x) => x.id === q.id);
      expect(c, q.id).toBeDefined();
      expect(q.lang).toBe(c!.lang);
      expect(q.text).toBe(c!.text);
      expect(q.routeId).toBe(c!.route_id);
    }
  });

  it("routes every offline-safe question to its route by keywords", () => {
    for (const q of DEMO_AI_SCRIPT.filter((x) => x.offlineSafe)) {
      expect(propose(q.text, ROUTES)?.route?.id, q.id).toBe(q.routeId);
    }
  });

  it("only names routes that exist on acme", () => {
    const ids = new Set(ROUTES.map((r) => r.id));
    for (const q of DEMO_AI_SCRIPT) expect(ids.has(q.routeId), q.id).toBe(true);
  });

  it("starts with the offline-safe English questions", () => {
    expect(DEMO_AI_SCRIPT.slice(0, 3).every((q) => q.lang === "en" && q.offlineSafe)).toBe(true);
  });
});
