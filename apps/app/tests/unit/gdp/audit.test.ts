import { describe, expect, it } from "vitest";
import { ACTOR_KINDS, AUDIT_ACTIONS, AUDIT_AREAS, actionLabelKey, actorLabelKey, areaOf, auditChanges, isAuditAction } from "@/features/audit";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const label = (cat: unknown, key: string) => (cat as Record<string, Record<string, string>>).settingsAudit?.[key];

describe("GDP audit shape", () => {
  it("auditChanges leaves out an unchanged field", () => {
    expect(auditChanges({ name: "A", mark: "x" }, { name: "A", mark: "x" }, [])).toEqual({});
  });

  it("auditChanges gives before and after of a changed field only", () => {
    expect(auditChanges({ role: "member", name: "A" }, { role: "leader", name: "A" }, [])).toEqual({ role: { before: "member", after: "leader" } });
    expect(auditChanges({ list: { a: 1, b: 2 } }, { list: { b: 2, a: 1 } }, [])).toEqual({});
    expect(auditChanges(null, { stage: "pilot" }, [])).toEqual({ stage: { before: null, after: "pilot" } });
  });

  it("auditChanges writes a secret field as set, replaced or removed and never its value", () => {
    const set = auditChanges({ key: "" }, { key: "sk-new" }, ["key"]);
    const replaced = auditChanges({ key: "sk-old" }, { key: "sk-new" }, ["key"]);
    const removed = auditChanges({ key: "sk-old" }, { key: null }, ["key"]);
    expect(set).toEqual({ key: { before: null, after: "set" } });
    expect(replaced).toEqual({ key: { before: null, after: "replaced" } });
    expect(removed).toEqual({ key: { before: null, after: "removed" } });
    expect(JSON.stringify([set, replaced, removed])).not.toMatch(/sk-/);
    expect(auditChanges({ key: "same" }, { key: "same" }, ["key"])).toEqual({});
  });

  it("isAuditAction is true for every listed action and false for others", () => {
    for (const a of AUDIT_ACTIONS) expect(isAuditAction(a), a).toBe(true);
    expect(isAuditAction("audit.member.ranked")).toBe(false);
    expect(isAuditAction("member.role")).toBe(false);
    expect(isAuditAction(undefined)).toBe(false);
  });

  it("every action sits in a known area", () => {
    for (const a of AUDIT_ACTIONS) expect(AUDIT_AREAS, a).toContain(areaOf(a));
    expect(areaOf("audit.member.role")).toBe("member");
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it("every action and actor kind has a label in both catalogs", () => {
    for (const a of AUDIT_ACTIONS) {
      expect(label(en, actionLabelKey(a)), a).toBeTruthy();
      expect(label(de, actionLabelKey(a)), a).toBeTruthy();
    }
    for (const k of ACTOR_KINDS) {
      expect(label(en, actorLabelKey(k)), k).toBeTruthy();
      expect(label(de, actorLabelKey(k)), k).toBeTruthy();
    }
    expect(actorLabelKey("break-glass")).toBe("actor_breakGlass");
  });
});
