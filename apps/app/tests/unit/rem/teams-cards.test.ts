// REM-T1 (B1): loop notices reach Teams as cards (INB D6 sent them as plain text): a pass, a question, a no, a yes and a project step's help ask carry the
// title, the reason and 'Open in NextUp'; a pass and a question carry the buttons the receiver may use, asked of the web's own rule (mayAppend); a template without
// a card stays the plain text card. Flat tests (REM D2).
import { expect, it } from "vitest";
import { meFor, type Actor } from "@/features/auth/identity";
import { cardSize, loopCard, loopCardKind, loopRights, MAX_CARD_BYTES, NO_LOOP_RIGHTS, parseSubmit, textCard, type Card, type CardNode, type LoopRights } from "@/features/teams/cards";
import { ev, raise, SEATS, stateOf } from "../ovl/fixture";

const actor = (userId: string, role: Actor["role"] = "leader"): Actor => ({ role, userId, me: meFor(userId, SEATS), name: userId, handle: null });
const ALL: LoopRights = { answer: true, handOver: true, reply: true };
const SEATS_LIST = SEATS.map((s) => ({ id: s.id, label: s.label }));
const base = { title: "Gauge for line 3", link: "https://acme.example/cases/c1", caseId: "c1", cardId: "msg1", seats: SEATS_LIST };
const titles = (c: Card) => (c.actions ?? []).map((a) => String(a.title));
const texts = (nodes: CardNode[] | undefined): string[] => (nodes ?? []).flatMap((n) => [typeof n.text === "string" ? n.text : "", ...(Array.isArray(n.columns) ? texts(n.columns as CardNode[]) : []), ...(Array.isArray(n.items) ? texts(n.items as CardNode[]) : []), ...(Array.isArray(n.facts) ? (n.facts as { title: string; value: string }[]).flatMap((f) => [f.title, f.value]) : [])]);
const shown = (c: Card) => texts(c.body).join("\n");
const showCard = (c: Card, title: string) => (c.actions ?? []).find((a) => a.title === title)?.card as { body: CardNode[]; actions: CardNode[] } | undefined;

it("REM teams pass card has answer and pass on", () => {
  const c = loopCard({ ...base, loop: "passed", reasonText: "It is about the quality desk's gauge" }, ALL, "en");
  expect(titles(c)).toEqual(["Answer", "Hand over", "Open in NextUp"]);
  expect(shown(c)).toContain("Case passed on");
  expect(shown(c)).toContain("Gauge for line 3");
  expect(shown(c)).toContain("Reason");
  expect(shown(c)).toContain("It is about the quality desk's gauge");
  // the buttons are the same forms a raised case's card has, and send back the card's own ids
  const answer = showCard(c, "Answer")!;
  expect(answer.actions[0]).toMatchObject({ type: "Action.Submit", data: { kind: "answer", caseId: "c1", cardId: "msg1" } });
  const pass = showCard(c, "Hand over")!;
  expect(pass.actions[0]).toMatchObject({ type: "Action.Submit", data: { kind: "handover", caseId: "c1", cardId: "msg1" } });
  expect(pass.body[0]).toMatchObject({ id: "toSeatId", choices: expect.arrayContaining([{ title: "H. Sander", value: "s_dep" }]) });
  // 'Open in NextUp' always leads to the case; in German the same card is in the receiver's language
  expect(c.actions?.at(-1)).toMatchObject({ type: "Action.OpenUrl", url: "https://acme.example/cases/c1" });
  expect(titles(loopCard({ ...base, loop: "passed", reasonText: "x" }, ALL, "de"))).toEqual(["Antworten", "Weitergeben", "In NextUp öffnen"]);
  expect(cardSize(c)).toBeLessThan(MAX_CARD_BYTES);
  // a question card carries the answer to it, which is a case.answered, not a decision
  const q = loopCard({ ...base, loop: "asked", reasonText: "Which shift?" }, ALL, "en");
  expect(titles(q)).toEqual(["Answer", "Open in NextUp"]);
  expect(shown(q)).toContain("Which shift?");
  expect(showCard(q, "Answer")!.actions[0]).toMatchObject({ data: { kind: "reply", caseId: "c1", cardId: "msg1" } });
  expect(parseSubmit({ kind: "reply", caseId: "c1", cardId: "msg1", text: " Early shift " })).toEqual({ kind: "reply", caseId: "c1", cardId: "msg1", text: "Early shift" });
  expect(parseSubmit({ kind: "reply", caseId: "c1", cardId: "msg1", text: "  " })).toBeNull();
});

it("REM teams card hides a button the receiver may not use", () => {
  // the rights are the web's: the desk holder may answer and pass a case on their desk; the raiser of the case may do neither and may answer a question
  const open = stateOf(3, [raise("c1", 0)]);
  const desk = loopRights(actor("u_own"), "c1", open);
  expect(desk).toEqual({ answer: true, handOver: true, reply: false });
  const raiser = loopRights(actor("u_ra", "member"), "c1", open);
  expect(raiser).toEqual({ answer: false, handOver: false, reply: false });
  const stranger = loopRights(actor("u_head"), "c1", open); // the seat above is not on the desk: nothing to answer or pass
  expect(stranger.answer || stranger.handOver || stranger.reply).toBe(false);

  const asked = stateOf(3, [raise("c1", 0), ev("case.asked", "u_own", "c1", { text: "Which shift?" }, 1)]);
  expect(loopRights(actor("u_ra", "member"), "c1", asked)).toMatchObject({ reply: true, answer: false, handOver: false });
  expect(loopRights(actor("u_own"), "c1", asked).reply).toBe(false); // the desk does not answer its own question

  // a button is on the card only for a right the receiver has; 'Open in NextUp' is always there, and the only action is the positive one
  expect(titles(loopCard({ ...base, loop: "passed", reasonText: "why" }, { ...desk, handOver: false }, "en"))).toEqual(["Answer", "Open in NextUp"]);
  expect(titles(loopCard({ ...base, loop: "passed", reasonText: "why" }, { ...desk, answer: false }, "en"))).toEqual(["Hand over", "Open in NextUp"]);
  const none = loopCard({ ...base, loop: "passed", reasonText: "why" }, raiser, "en");
  expect(titles(none)).toEqual(["Open in NextUp"]);
  expect(none.actions?.[0]).toMatchObject({ style: "positive" });
  expect(titles(loopCard({ ...base, loop: "asked", reasonText: "Which shift?" }, NO_LOOP_RIGHTS, "en"))).toEqual(["Open in NextUp"]);
  // and the raiser who answered is refused by the rule the card is checked with when it arrives: a decision card for someone who cannot decide has no Answer
  expect(titles(loopCard({ ...base, loop: "passed", reasonText: "why" }, loopRights(actor("u_ra", "member"), "c1", open), "en"))).not.toContain("Answer");
});

it("REM teams yes card has no buttons", () => {
  const yes = loopCard({ ...base, loop: "decided", decision: "yes", reasonText: "Go ahead, line 3 first" }, ALL, "en");
  expect(titles(yes)).toEqual(["Open in NextUp"]);
  expect(shown(yes)).toContain("Answered: yes");
  expect(shown(yes)).toContain("Gauge for line 3");
  expect(shown(yes)).toContain("Go ahead, line 3 first");
  // even a receiver who could answer gets no button on a decision's card, a no included; the card carries its title, reason and the way into NextUp
  const no = loopCard({ ...base, loop: "decided", decision: "no", reasonText: "No budget before Q4: the fixture team is busy until then" }, ALL, "en");
  expect(titles(no)).toEqual(["Open in NextUp"]);
  expect(shown(no)).toContain("Answered: no");
  expect(shown(no)).toContain("No budget before Q4");
  expect(titles(loopCard({ ...base, loop: "decided", decision: "no", reasonText: "Kein Budget" }, ALL, "de"))).toEqual(["In NextUp öffnen"]);
  expect(shown(loopCard({ ...base, loop: "decided", decision: "no", reasonText: "Kein Budget" }, ALL, "de"))).toContain("Beantwortet: Nein");
  // a project step that asks for help: the title, the step, the ask and the link; no button
  const step = loopCard({ title: "Shorter changeover", step: "Order the crane slot", reasonText: "Can the sponsor book it?", link: "https://acme.example/projects/p1", loop: "step" }, ALL, "en");
  expect(titles(step)).toEqual(["Open in NextUp"]);
  expect(shown(step)).toContain("Shorter changeover");
  expect(shown(step)).toContain("Order the crane slot");
  expect(shown(step)).toContain("Can the sponsor book it?");
  expect(step.actions?.[0]).toMatchObject({ url: "https://acme.example/projects/p1" });
});

it("REM teams unknown template stays text", () => {
  for (const template of ["loop.case.commented", "loop.project.paused", "loop.agent.accepted", "reminder.quiet", "raised", "digest", "", "constructor"]) {
    expect(loopCardKind(template), template).toBeNull();
  }
  // the four that have a card
  expect([ "loop.case.handed", "loop.case.asked", "loop.case.decided", "loop.project.help.asked"].map(loopCardKind)).toEqual(["passed", "asked", "decided", "step"]);
  // what such a notice is sent as: the plain text card with the subject, the text and the link, as before
  const text = textCard({ subject: "Project paused", text: "The lead paused it until Friday.", link: "https://acme.example/projects/p1" }, "en");
  expect(texts(text.body).join("\n")).toContain("Project paused");
  expect(texts(text.body).join("\n")).toContain("The lead paused it until Friday.");
  expect(titles(text)).toEqual(["Open in NextUp"]);
});
