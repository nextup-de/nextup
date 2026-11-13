// OVL-A1: the away card and its dialog render what they are handed (plan OVL, D19, D31): the own span with End, the dates, the line that no reason is kept, the cases
// to take back, and nothing at all in the demo (D8). Static markup of the client components with the demo context and the server actions mocked.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";

const ctx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ctx.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/server/actions/overload", () => ({ setAway: vi.fn(), endAway: vi.fn(), takeBack: vi.fn(), listAwayTargets: vi.fn(async () => []) }));

import { AwayCard } from "@/components/overload/AwayCard";
import { AwayDialog, dayOfIso, isoOfDay } from "@/components/overload/AwayDialog";
import { AwayForOthers } from "@/components/overload/AwayForOthers";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n";

const CLOCK = { mode: "workdays", calendar: DEFAULT_CALENDAR } as const;
const view = (locale: Locale, node: React.ReactElement) => html(h(I18nProvider, { locale, children: node }));
const clockAway = { id: "e1", ts: 0, day: 11, type: "case.handed", actor: "system:clock", actorUserId: null, target: "c1", payload: { why: "away", to: "B. Desk", toRoleHolderId: "seat_b" } };
const handedCase = (id: string, title: string) => ({
  id, title, status: "open", assigneeSeatId: "seat_b", assigneeRoleId: "role_desk",
  handed: [{ from: "system:clock", fromUserId: null, to: "B. Desk", toSeatId: "seat_b", why: "away", day: 11, fromSeatId: "seat_a", back: false, up: false }],
  history: [{ ...clockAway, target: id }],
});
const stateOf = (over: { away?: unknown[]; cases?: unknown[]; day?: number } = {}): State =>
  ({ day: over.day ?? 20, cases: over.cases ?? [], projects: [], seats: [{ id: "seat_a", roleId: "role_desk", label: "A. Desk", userId: "u_a", sort: 0 }, { id: "seat_b", roleId: "role_desk", label: "B. Desk", userId: "u_b", sort: 1 }],
    routes: [], rules: {}, approvals: { ...EMPTY_APPROVAL_CONFIG, roles: [] }, overload: { away: over.away ?? [], desks: [] } }) as unknown as State;
const demoCtx = (state: State, serverMode = true) => ({
  serverMode, actorUserId: "u_a", S: state, log: { events: state.cases.flatMap((c) => c.history), day: state.day }, f: (d: number) => `day ${d}`, tenant: { slug: "acme" }, seed: { clock: CLOCK }, locale: "en",
});

beforeEach(() => { ctx.value = demoCtx(stateOf()); });

describe("the away card", () => {
  it("shows the own current span with End, the dialog to set one and nothing to take back", () => {
    ctx.value = demoCtx(stateOf({ away: [{ awayId: "away1", userId: "u_a", from: 25, to: 30, setBy: "u_a", endedDay: null }] }));
    const out = view("en", h(AwayCard));
    expect(out).toContain("Away until day 30");
    expect(out).toContain('data-testid="away-end"');
    expect(out).toContain("Nothing to take back.");
    expect(out).toContain("Cases handed on while you were away");
    // Another person's span is not shown.
    ctx.value = demoCtx(stateOf({ away: [{ awayId: "away2", userId: "u_b", from: 25, to: 30, setBy: "u_b", endedDay: null }] }));
    expect(view("en", h(AwayCard))).not.toContain("away-end");
  });

  it("lists the cases the clock handed on while the person was away, each with Take back", () => {
    // A span 10..12 of Anna's that is over on day 20, and two cases the clock handed to the cover during it; the second one a person touched since.
    const state = stateOf({ away: [{ awayId: "away1", userId: "u_a", from: 10, to: 12, setBy: "u_a", endedDay: null }], cases: [handedCase("c1", "Shorter changeover"), handedCase("c2", "Line three")] });
    ctx.value = { ...demoCtx(state), log: { events: [...state.cases.flatMap((c) => c.history), { id: "n1", ts: 0, day: 15, type: "case.commented", actor: "B. Desk", actorUserId: "u_b", target: "c2", payload: { text: "On it" } }], day: 20 } };
    const out = view("en", h(AwayCard));
    expect(out).toContain("Shorter changeover");
    expect(out).toContain('data-testid="away-takeback-c1"');
    expect(out).not.toContain("Line three"); // touched in the log only: a comment counts
    expect(out).not.toContain("Nothing to take back.");
    expect(view("de", h(AwayCard))).toContain("Zurücknehmen");
  });

  it("is not there in the demo, or without a person", () => {
    ctx.value = demoCtx(stateOf(), false);
    expect(view("en", h(AwayCard))).toBe("");
    expect(view("en", h(AwayForOthers))).toBe("");
    ctx.value = { ...demoCtx(stateOf()), actorUserId: null };
    expect(view("en", h(AwayCard))).toBe("");
  });
});

describe("the away dialog", () => {
  it("has two date fields starting today, Save and the line that no reason is kept; for someone else it names them", () => {
    const today = dateOfWorkday(20, DEFAULT_CALENDAR);
    const own = view("en", h(AwayDialog, { forUserId: "u_a", onDone: () => {} }));
    expect(own).toContain('data-testid="away-from"');
    expect(own).toContain(`value="${today}"`);
    expect(own).toContain("No reason is asked or kept.");
    const other = view("en", h(AwayDialog, { forUserId: "u_b", forName: "Ben", onDone: () => {} }));
    expect(other).toContain("Set Ben away");
    expect(view("de", h(AwayDialog, { forUserId: "u_b", forName: "Ben", onDone: () => {} }))).toContain("Ben");
  });

  it("turns a picked date into the company's working day and refuses a day off", () => {
    const monday = dateOfWorkday(20, DEFAULT_CALENDAR);
    expect(dayOfIso(CLOCK, monday)).toBe(20);
    expect(isoOfDay(CLOCK, 20)).toBe(monday);
    const sunday = new Date(`${monday}T12:00:00Z`);
    do sunday.setUTCDate(sunday.getUTCDate() + 1); while (sunday.getUTCDay() !== 0);
    expect(dayOfIso(CLOCK, sunday.toISOString().slice(0, 10))).toBeNull();
    expect(dayOfIso(CLOCK, "not a date")).toBeNull();
    expect(dayOfIso({ mode: "demo" }, monday)).toBeNull();
    expect(isoOfDay({ mode: "demo" }, 20)).toBe("");
  });
});
