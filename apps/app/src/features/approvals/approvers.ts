// The named approvers of an idea (decisions A to D, Kevin and Sam, 16 Nov 2026). The first decider's yes opens a parallel approval among at most three
// named people: every step the company's rules give (budget, council, role) counts through the person who heads it - the first person holding the role
// (a council through its secretary) - and the desk may name roles or people by hand. The idea's 'Affects' chips only inform; they are never approvers.
// Pure: the steps and the seats in, the steps with their person out. The server stamps the result into case.provisional; the yes sheet shows the same list.
import { seatsOfRole, type SeatRow } from "@/features/auth/identity";
import { MAX_APPROVERS, type ApprovalConfig, type ApprovalStepInput } from "./types";

type NameInput = {
  /** The steps the rules gave, in their order (budget, councils, roles, roles added by hand: rules.ts approvalsFor). */
  steps: readonly ApprovalStepInput[];
  /** People the desk named by hand, by user id, in the order named. Only people who hold a seat count: a name needs a seat to be shown. */
  people?: readonly string[];
  seats: readonly SeatRow[];
  config: Pick<ApprovalConfig, "councils">;
  /** The first decider and the raiser: the decider's yes is already given, and nobody approves their own idea (D13). */
  exclude: readonly (string | null)[];
};

/** The role a step counts through: its role, or a council's secretary role. */
const roleOfStep = (step: ApprovalStepInput, config: Pick<ApprovalConfig, "councils">): string | undefined =>
  step.kind === "council" ? config.councils.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;

/** The people who hold a role, by seat sort. */
const holdersOf = (seats: readonly SeatRow[], roleId: string | undefined): string[] =>
  roleId === undefined ? [] : seatsOfRole(seats, roleId).flatMap((s) => (s.userId === null ? [] : [s.userId]));

/**
 * The approvers of a parallel run (decision A): each step with the person who answers it, at most MAX_APPROVERS, each person once. The head of a step is
 * its role's first holder other than the decider and the raiser; a role only they hold gives no step (the decider's yes is given, nobody approves their
 * own idea); a step whose role nobody holds keeps no person and waits for its role's holders, as an old step did. The rules' steps come before the people named by hand, so a required approval is never pushed out by a hand-picked one.
 */
export function nameApprovers(input: NameInput): ApprovalStepInput[] {
  const skip = new Set(input.exclude.filter((u): u is string => u !== null));
  const seen = new Set<string>();
  const out: ApprovalStepInput[] = [];
  for (const step of input.steps) {
    // The head: the first holder who is neither the decider nor the raiser. A role only they hold is their say already (or none): no step.
    const holders = holdersOf(input.seats, roleOfStep(step, input.config));
    const head = holders.find((u) => !skip.has(u)) ?? null;
    if (head === null && holders.length > 0) continue;
    if (head !== null && seen.has(head)) continue;
    if (head !== null) seen.add(head);
    const { userId: _client, ...rest } = step; // eslint-disable-line @typescript-eslint/no-unused-vars -- the person is the server's call, never the client's
    out.push(head === null ? rest : { ...rest, userId: head });
  }
  for (const userId of input.people ?? []) {
    if (skip.has(userId) || seen.has(userId) || !input.seats.some((s) => s.userId === userId)) continue;
    seen.add(userId);
    out.push({ kind: "person", userId, byHand: true });
  }
  return out.slice(0, MAX_APPROVERS);
}

/** What to call an approver: the label of the first seat the person holds (seats are labelled with their holder's name); empty when they hold none. */
export const approverName = (seats: readonly SeatRow[], userId: string | null | undefined): string =>
  userId == null ? "" : [...seats].sort((a, b) => a.sort - b.sort).find((s) => s.userId === userId)?.label ?? "";
