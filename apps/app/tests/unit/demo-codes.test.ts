// Demo login codes for admin.sellux.ch: who gets one, in which order, in the contract's shape.
import { describe, expect, it } from "vitest";
import { DemoLoginsReport, LOGINS_CONTRACT_VERSION } from "@nextup/contracts";
import { planDemoCodes } from "@/features/admin/demo-codes";
import { looksLikeLoginCode } from "@/features/auth/login-code";

const people = [
  { id: "u1", name: "J. Schmidt", role: "member", line: "", dept: "Production, Line 3" },
  { id: "u2", name: "T. Vogel", role: "leader", line: "Team lead · Production", dept: "Production" },
  { id: "u3", name: "M. Roth", role: "manager", line: "Plant manager", dept: "" },
  { id: "u4", name: "Robot <script>", role: "member", line: "", dept: "" },
  { id: "u5", name: "A. Weber", role: "admin", line: "", dept: "" },
];

describe("demo login codes", () => {
  it("gives everyone the message can carry a new code, managers first", () => {
    const plan = planDemoCodes("acme", people);
    expect(plan.map((p) => p.userId)).toEqual(["u3", "u2", "u1"]);
    expect(plan[2].login).toMatchObject({ name: "J. Schmidt", role: "member", line: "Production, Line 3" });
    for (const p of plan) expect(looksLikeLoginCode(p.login.code, "acme")).toBe(true);
    expect(new Set(plan.map((p) => p.login.code)).size).toBe(3);
  });

  it("fits the report admin takes", () => {
    const logins = planDemoCodes("acme", people).map((p) => p.login);
    expect(DemoLoginsReport.safeParse({ contractVersion: LOGINS_CONTRACT_VERSION, companySlug: "acme", stage: "demo", logins }).success).toBe(true);
  });
});
