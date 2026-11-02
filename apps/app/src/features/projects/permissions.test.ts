import { describe, expect, it } from "vitest";
import type { Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { de } from "@/i18n/de";
import { mayAppendProject } from "./permissions";

const actor = { role: "member", name: "A. Member", handle: null } as unknown as Actor;
const empty = { projects: [] } as unknown as State;
const ask = (locale?: "de" | "en") => mayAppendProject(actor, { type: "project.started", target: "p1", payload: {} }, empty, locale);

describe("project permissions in two languages", () => {
  it("refuses in English by default and in German on request", () => {
    expect(ask()).toEqual({ ok: false, error: "No such project." });
    expect(ask("en")).toEqual(ask());
    expect(ask("de")).toEqual({ ok: false, error: de.projects.permNoProject });
  });
});
