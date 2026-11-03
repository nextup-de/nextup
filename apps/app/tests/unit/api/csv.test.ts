import { describe, expect, it } from "vitest";
import { parseCsv, writeCsv } from "@/features/api/csv";
import { checkStructureCsv, structureToCsv, MAX_ROWS, type Current } from "@/features/api/structure-csv";

const EMPTY: Current = { units: [], roles: [], holders: [], rules: [], goals: [], members: [] };
const U = "key,name,kind,parent_key,headcount\n";
const R = "unit_key,title,reports_to_unit_key,reports_to_title,seats,spend_limit_eur,decides\n";
const M = "name,email,department,app_role,language,seat_unit_key,seat_role_title\n";
const T = "key,keywords,owner_unit_key,owner_role_title\n";

describe("API structure CSV", () => {
  it("reads comma and semicolon files, with or without a BOM", () => {
    const a = parseCsv("a,b\n1,2\n");
    expect(a).toMatchObject({ header: ["a", "b"], rows: [["1", "2"]], sep: "," });
    const b = parseCsv("﻿a;b\r\n1;2\r\n3;4");
    expect(b).toMatchObject({ header: ["a", "b"], rows: [["1", "2"], ["3", "4"]], sep: ";" });
  });

  it("reads quotes, doubled quotes and line breaks in quotes, and tracks the file line", () => {
    const p = parseCsv('a,b\n"x, y","say ""hi"""\n"two\nlines",z\nlast,row\n');
    expect(p.rows).toEqual([["x, y", 'say "hi"'], ["two\nlines", "z"], ["last", "row"]]);
    expect(p.lines).toEqual([2, 3, 5]);
    expect(p.unterminated).toBe(false);
    expect(parseCsv('a\n"open').unterminated).toBe(true);
  });

  it("a semicolon inside a quoted comma file does not change the separator", () => {
    expect(parseCsv('a,b\n"x;y;z",1\n').sep).toBe(",");
    expect(parseCsv('"a,b";c\n1;2').sep).toBe(";");
  });

  it("writeCsv round-trips what parseCsv reads", () => {
    const header = ["a", "b"];
    const rows = [["x, y", 'say "hi"'], ["two\nlines", ""], [" padded ", "ü"]];
    for (const sep of [",", ";"] as const) {
      const p = parseCsv(writeCsv(header, rows, sep));
      expect(p.header).toEqual(header);
      expect(p.rows).toEqual(rows);
      expect(p.sep).toBe(sep === ";" ? ";" : ",");
    }
  });

  it("reports every bad row with file, line and column", () => {
    const r = checkStructureCsv(
      {
        units: U + "OPS,Operations,dept,,10\nbad key,X,dept,,\nQA,Quality,wrong,NOPE,x\nOPS,Again,dept,,\n",
        members: M + "A,a@x.de,,member,de,,\nB,not-an-email,,boss,fr,,\n",
      },
      EMPTY,
    );
    expect(r.ok).toBe(false);
    const at = (file: string, line: number, column: string) => r.errors.find((e) => e.file === file && e.line === line && e.column === column);
    expect(at("units", 3, "key")?.message).toBe("settingsImport.errKeyFormat");
    expect(at("units", 4, "kind")?.message).toBe("settingsImport.errKind");
    expect(at("units", 4, "parent_key")?.message).toBe("settingsImport.errParentUnknown");
    expect(at("units", 4, "headcount")?.message).toBe("settingsImport.errNumber");
    expect(at("units", 5, "key")).toMatchObject({ message: "settingsImport.errDuplicate", values: { a: 2, b: 5 } });
    expect(at("members", 3, "email")?.message).toBe("settingsImport.errEmail");
    expect(at("members", 3, "app_role")?.message).toBe("settingsImport.errAppRole");
    expect(at("members", 3, "language")?.message).toBe("settingsImport.errLanguage");
    expect(r.errors.every((e) => e.line >= 2)).toBe(true);
  });

  it("refuses a file over 5,000 rows and a file without its columns", () => {
    const big = U + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `U${i},N,dept,,1`).join("\n");
    expect(checkStructureCsv({ units: big }, EMPTY).errors).toEqual([{ file: "units", line: 0, column: "", message: "settingsImport.errRows", values: { max: MAX_ROWS } }]);
    const ok = U + Array.from({ length: MAX_ROWS }, (_, i) => `U${i},N,dept,,1`).join("\n");
    expect(checkStructureCsv({ units: ok }, EMPTY).ok).toBe(true);
    expect(checkStructureCsv({ units: "key,name\nA,B" }, EMPTY).errors[0]).toMatchObject({ column: "kind", message: "settingsImport.errColumnMissing" });
  });

  it("plans adds, resolves references between files, ignores unknown columns, and orders parents first", () => {
    const r = checkStructureCsv(
      {
        units: "key,name,kind,parent_key,headcount,extra\nTEAM,Team,team,OPS,3,x\nOPS,Operations,dept,,10,y\n",
        roles: R + "OPS,Head,,,1,5000,approve;buy\nTEAM,Lead,OPS,Head,2,,\n",
        members: M + "Ann,ANN@x.de,Ops,manager,de,TEAM,Lead\n",
        routes: T + "r1,order;buy,TEAM,Lead\n",
      },
      EMPTY,
    );
    expect(r.errors).toEqual([]);
    expect(r.plan.units.map((u) => u.key)).toEqual(["OPS", "TEAM"]);
    expect(r.plan.roles.map((x) => x.title)).toEqual(["Head", "Lead"]);
    expect(r.plan.roles[0]).toMatchObject({ decides: ["approve", "buy"], spendLimitEur: 5000, seats: 1 });
    expect(r.plan.members[0]).toMatchObject({ email: "ann@x.de", role: "manager", seat: { unitKey: "TEAM", title: "Lead" } });
    expect(r.plan.routes[0]).toMatchObject({ key: "r1", keywords: ["order", "buy"] });
    expect(r.plan.ignored.units).toEqual(["extra"]);
  });

  it("finds loops and unknown references", () => {
    const r = checkStructureCsv(
      {
        units: U + "A,A,dept,B,\nB,B,dept,A,\n",
        roles: R + "A,X,A,Y,,,\nA,Y,A,X,,,\nA,Z,A,Q,,,\n",
        routes: T + "r,k,A,Nobody\n",
      },
      EMPTY,
    );
    const msgs = r.errors.map((e) => `${e.file}:${e.line}:${e.message.split(".")[1]}`);
    expect(msgs).toContain("units:2:errUnitLoop");
    expect(msgs).toContain("roles:2:errReportsLoop");
    expect(msgs).toContain("roles:4:errReportsUnknown");
    expect(msgs).toContain("routes:2:errOwnerUnknown");
  });

  it("counts a row that matches the current structure as unchanged, and exports files that import clean", () => {
    const current: Current = {
      units: [{ id: "u1", key: "OPS", name: "Operations", kind: "dept", headcount: 4, parentId: null, sort: 0 }],
      roles: [{ id: "r1", orgUnitId: "u1", title: "Head", reportsToId: null, decides: ["buy"], spendLimitEur: 100, skills: [], sort: 0 }],
      holders: [{ id: "h1", roleId: "r1", name: "Head", userId: "m1", sort: 0 }],
      rules: [{ id: "x1", key: "r1", type: "Orders", keywords: ["order"], ownerRoleId: "r1", deputyRoleId: null, buddyRoleId: null, wait: "", sort: 0 }],
      goals: [],
      members: [{ id: "m1", name: "Ann", email: "ann@x.de", dept: "Ops", role: "manager", locale: "de", active: true }],
    };
    const files = structureToCsv(current, current.members);
    expect(files.members).not.toMatch(/code|token|secret/i);
    const r = checkStructureCsv(files, current);
    expect(r.errors).toEqual([]);
    expect(r.plan.same).toEqual({ units: 1, roles: 1, members: 1, routes: 1 });
    expect([r.plan.units, r.plan.roles, r.plan.members, r.plan.routes].flat()).toEqual([]);
    // An edit is a change, not an add.
    const edited = checkStructureCsv({ units: files.units.replace("Operations", "Operations 2") }, current);
    expect(edited.plan.units).toMatchObject([{ op: "change", key: "OPS", name: "Operations 2" }]);
  });

  it("refuses a set that would leave the company without a manager", () => {
    const current: Current = { ...EMPTY, members: [{ id: "m1", name: "Ann", email: "ann@x.de", dept: "", role: "manager", locale: null, active: true }] };
    const r = checkStructureCsv({ members: M + "Ann,ann@x.de,,member,,,\n" }, current);
    expect(r.errors).toMatchObject([{ file: "members", line: 2, column: "app_role", message: "settingsImport.errNoManager" }]);
  });
});
