// The account menu's ways to Settings and the IT console: who gets which, without typing an address.
import { describe, expect, it } from "vitest";
import { adminMenuLinks } from "@/config/nav";

describe("adminMenuLinks", () => {
  it("gives a manager Settings", () => {
    expect(adminMenuLinks({ role: "manager", serverMode: true, prefix: "/acme", consoleHref: null })).toEqual([
      { key: "shell.navSettings", href: "/acme/settings" },
    ]);
  });

  it("uses the stack's prefix, which is empty on a one-company stack", () => {
    expect(adminMenuLinks({ role: "manager", serverMode: true, prefix: "", consoleHref: null })[0].href).toBe("/settings");
  });

  it("gives a console admin the IT console, whatever their role", () => {
    for (const role of ["member", "leader"] as const) {
      expect(adminMenuLinks({ role, serverMode: true, prefix: "", consoleHref: "/admin" })).toEqual([{ key: "shell.itConsole", href: "/admin" }]);
    }
  });

  it("lists Settings first for a manager who is also a console admin", () => {
    expect(adminMenuLinks({ role: "manager", serverMode: true, prefix: "", consoleHref: "/admin" }).map((l) => l.key)).toEqual(["shell.navSettings", "shell.itConsole"]);
  });

  it("gives anyone else nothing", () => {
    for (const role of ["member", "leader"] as const) expect(adminMenuLinks({ role, serverMode: true, prefix: "", consoleHref: null })).toEqual([]);
  });

  it("shows no Settings without a database, where those pages do not exist", () => {
    expect(adminMenuLinks({ role: "manager", serverMode: false, prefix: "/acme", consoleHref: null })).toEqual([]);
  });
});
