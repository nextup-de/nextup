import { describe, expect, it } from "vitest";
import { ACTOR_KINDS, AUDIT_ACTIONS, areaOf } from "@/features/audit";
import {
  actionLabelKey, actorLabelKey, auditCsv, auditQuery, parseAuditFilter, showTotal, targetLabel,
} from "@/features/audit/view";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const cat = (c: unknown, k: string) => (c as Record<string, Record<string, string>>).settingsAudit?.[k];

describe("GDP audit view", () => {
  it("parseAuditFilter defaults to 30 days and drops unknown values", () => {
    expect(parseAuditFilter(new URLSearchParams())).toEqual({ period: "30d" });
    const f = parseAuditFilter(new URLSearchParams("period=9y&area=member,bogus&actor=admin,robot&cursor=nonsense"));
    expect(f).toEqual({ period: "30d", areas: ["member"], actorKinds: ["admin"] });
    expect(parseAuditFilter({ period: "12m", person: "u1" })).toEqual({ period: "12m", actorUserId: "u1" });
  });

  it("auditQuery gives the period start and the actions of the areas", () => {
    expect(auditQuery({ period: "7d" }, NOW).from.toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(auditQuery({ period: "12m" }, NOW).from.toISOString()).toBe("2025-11-02T12:00:00.000Z");
    const q = auditQuery({ period: "30d", areas: ["token"], actorUserId: "u1" }, NOW);
    expect(q.actions).toEqual(["audit.token.created", "audit.token.revoked"]);
    expect(q.actorUserId).toBe("u1");
    expect(q.take).toBe(50);
    expect(auditQuery({ period: "30d" }, NOW).actions).toBeUndefined();
  });

  it("labels every actor kind and every action, and a missing user", () => {
    for (const kind of ACTOR_KINDS) {
      const k = actorLabelKey({ actorKind: kind });
      expect(cat(en, k), kind).toBeTruthy();
      expect(cat(de, k), kind).toBeTruthy();
    }
    for (const a of AUDIT_ACTIONS) {
      const k = actionLabelKey(a);
      expect(k && cat(en, k), a).toBeTruthy();
      expect(k && cat(de, k), a).toBeTruthy();
      expect(cat(en, `area_${areaOf(a)}`)).toBeTruthy();
    }
    expect(actionLabelKey("audit.nope.nothing")).toBeNull();
    expect(targetLabel({ targetKind: "member", targetId: "u1" }, { u1: "Former member #1234" })).toEqual({ kind: "person", name: "Former member #1234" });
    expect(targetLabel({ targetKind: "member", targetId: "gone" }, {})).toEqual({ kind: "deletedPerson" });
    expect(targetLabel({ targetKind: "token", targetId: "t1" }, {})).toEqual({ kind: "ref", targetKind: "token", id: "t1" });
    expect(targetLabel({ targetKind: null, targetId: null }, {})).toEqual({ kind: "none" });
  });

  it("auditCsv quotes a comma, a quote and a newline in a field", () => {
    const csv = auditCsv([
      { id: "1", at: new Date("2026-11-01T10:00:00.000Z"), actorKind: "admin", actorUserId: "u1", action: "audit.member.role", targetKind: "member", targetId: "a,b", changes: { note: { before: 'say "hi"', after: "x\ny" } } },
      { id: "2", at: "2026-11-01T09:00:00.000Z", actorKind: "system", actorUserId: null, action: "audit.privacy.retention_run", targetKind: null, targetId: null, changes: {} },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("at,actorKind,actor,action,targetKind,target,changes");
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('""before"":""say \\""hi\\""""');
    expect(csv).toContain("\\n"); // JSON escapes the newline, so one line per row
    expect(lines).toHaveLength(4); // header, two rows, trailing break
    expect(lines[2]).toBe("2026-11-01T09:00:00.000Z,system,,audit.privacy.retention_run,,,{}");
    expect(csv).toContain('"{""note"":');
  });

  it("showTotal is false with a person filtered", () => {
    expect(showTotal({ period: "30d" })).toBe(true);
    expect(showTotal({ period: "30d", actorUserId: "u1" })).toBe(false);
  });
});
