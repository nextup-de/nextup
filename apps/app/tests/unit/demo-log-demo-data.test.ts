// The dev panel's Demo data switch: off until switched, and the switch is temporary (sessionStorage, this tab).
import { beforeEach, describe, expect, it, vi } from "vitest";

function storage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
  };
}

describe("Demo data switch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });

  it("is unset at first, holds for the tab and stays out of localStorage", async () => {
    const log = await import("@/lib/demo-log");
    expect(log.getSnapshot("acme").prefs.demo).toBeUndefined();
    log.setPrefs("acme", { demo: true });
    expect(log.getSnapshot("acme").prefs.demo).toBe(true);
    expect(sessionStorage.getItem("nextup.acme.demo.v1")).toBe("1");
    expect(JSON.parse(localStorage.getItem("nextup.acme.prefs.v1") ?? "{}").demo).toBeUndefined();
    // a new page load in the same tab reads it again
    vi.resetModules();
    expect((await import("@/lib/demo-log")).getSnapshot("acme").prefs.demo).toBe(true);
  });

  it("ignores a value older versions kept in localStorage, and a new tab starts unset", async () => {
    localStorage.setItem("nextup.acme.prefs.v1", JSON.stringify({ demo: true, dept: "OPS" }));
    const log = await import("@/lib/demo-log");
    expect(log.getSnapshot("acme").prefs.demo).toBeUndefined();
    expect(log.getSnapshot("acme").prefs.dept).toBe("OPS");
  });

  it("log out clears it", async () => {
    const log = await import("@/lib/demo-log");
    log.setPrefs("acme", { demo: true });
    log.clearPrefs("acme");
    expect(sessionStorage.getItem("nextup.acme.demo.v1")).toBeNull();
    expect(log.getSnapshot("acme").prefs.demo).toBeUndefined();
  });
});
