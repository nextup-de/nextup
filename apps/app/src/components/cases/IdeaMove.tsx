"use client";
// "Your move" on an idea's one page (/idea?id=, DESIGN_RULES §9): the block the inbox shows, in one place (beside the idea on a laptop, on top on a
// phone), for whatever this viewer has to do with the idea: decide it on their desk, vote as an approver, answer the desk's question (quoted above
// its button), send a returned idea again, take it back, stand behind it for their team, move it to another desk. After the yes the status line is
// the way to the project. Every move is the sheet or event the page had before; who may do what stays where it is decided (features/cases/
// case-actions, features/approvals/rights).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { deskMoves, type IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import { sortMoves, YourMove, type Move } from "@/components/inbox/YourMove";
import { caseApprovalView } from "@/features/approvals/case-view";
import { mayResendApproval } from "@/features/approvals/rights";
import { ideaApprovalStatus } from "@/features/approvals/status";
import { caseActions } from "@/features/cases/case-actions";
import { followHref } from "@/features/cases/links";
import type { ReducedCase } from "@/features/cases/reducer";
import { affectedOn } from "@/features/cases/selectors";
import { isPrivateIdea } from "@/features/cases/visibility";
import { isOpenDraft, mayReadDraft } from "@/features/projects/views";
import { useT } from "@/i18n/client";
import { ApproverMove } from "./ApproverMove";
import styles from "@/components/inbox/YourMove.module.css";

type Form = "withdraw" | "why" | "desk" | null;

/** `desk`: the item as the inbox opens it, when the idea is on the viewer's desk or their view is asked (useOpenItem); null otherwise. */
export function IdeaMove({ c, desk }: { c: ReducedCase; desk: IdeaProps | null }) {
  const { S, me, role, act, openSheet, showToast, href, serverMode, seed, log, actorUserId } = useDemo();
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<Form>(null);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [resent, setResent] = useState(false); // one resend per click: the run that follows replaces this view
  const view = caseApprovalView(c, S, me);

  // On the viewer's desk: the desk's decision, the moves the inbox shows. A pending review forwards and never says yes (plan GAT): its block is the move then.
  if (desk && !view.review?.pending) return <YourMove status={desk.status?.label} moves={deskMoves(desk.brief, desk.onDecide)} name="desk" />;
  // An approver with a step open: the vote. It is answered on the server (D8), so a demo without one draws none.
  if (serverMode && view.myStep) {
    const latest = view.runs[0];
    const step = view.myStep;
    return <ApproverMove key={`${step.stepId}@${step.dueRev}`} c={c} mine={{ ...step, parallel: latest?.parallel ?? false }} council={latest?.steps.find((x) => x.id === step.stepId)?.kind === "council"} />;
  }

  const mine = me.userId !== null && c.fromUserId === me.userId;
  const lead = role !== "member";
  const actions = caseActions(c, me, role, S);
  const approval = ideaApprovalStatus(c, S);
  const meToo = me.userId !== null && affectedOn(log, c.id).some((a) => a.userId === me.userId);
  const routes = actions.moveToDesk ? seed.routes.filter((r) => r.id !== c.route?.id) : [];
  const moves: Move[] = [];
  let rec = "";
  let status: React.ReactNode = null;
  let quote: string | null = null;
  const open = (f: Form) => { setForm(f); setText(""); setTo(""); };

  // The raiser: answer the desk's question, send a returned idea again, take it back while nobody has decided it (decision Q1.14).
  if (mine && c.status === "asked") {
    quote = c.question?.text || null;
    moves.push({ key: "answer", label: t("dashboard.detailAnswerQuestion"), onSelect: () => openSheet("reply", c.id) });
    rec = "answer";
  }
  if (approval.returned !== null && !resent && mayResendApproval({ userId: me.userId }, c)) {
    status = <span data-testid="approver-returned">{t("approvals.returnedLine", { name: approval.returned.by, reason: approval.returned.reason })}</span>;
    moves.push({ key: "resend", label: t("approvals.resend"), testId: "approver-resend", onSelect: () => { setResent(true); act.provisional(c.id, { resend: true }); showToast(t("approvals.resent")); } });
    rec = "resend";
  }
  if (mine && !c.decided && (c.open || c.status === "asked")) moves.push({ key: "withdraw", label: t("dashboard.detailWithdraw"), testId: "case-withdraw", onSelect: () => open("withdraw") });
  // Anyone on an open case: a lead stands behind it for their team (and can take that back), an employee brings new information; both say why.
  if (c.open && lead) moves.push(meToo
    ? { key: "affects", label: "✓ " + t("dashboard.detailAffects"), onSelect: () => { act.affect(c.id); showToast(t("dashboard.detailWithdrawn")); } }
    : { key: "affects", label: t("dashboard.detailAffects"), onSelect: () => open("why") });
  if (c.open && !lead) moves.push({ key: "rescore", label: t("dashboard.detailReevaluate"), onSelect: () => open("why") });
  if (routes.length > 0) moves.push({ key: "desk", label: t("loopCase.moveDesk"), testId: "case-move-desk", onSelect: () => open("desk") });
  // A closed one: start a better idea from it, or raise a follow-up.
  if (!c.open && c.withdrawn === null) moves.push(actions.betterIdea
    ? { key: "better", label: t("caseSee.startBetter"), testId: "start-better-top", onSelect: () => router.push(href(followHref(c.id))) }
    : { key: "follow", label: t("dashboard.detailFollowUp"), onSelect: () => router.push(href("/raise")) });

  // After the yes: the status line is the way to its project, for whoever may read it (a draft is for the people on it, SET D13).
  const projectId = c.decided?.answer === "yes" ? c.decided.projectId ?? null : null;
  const project = projectId ? S.projects.find((p) => p.id === projectId) : undefined;
  if (project && !(isOpenDraft(project) && !mayReadDraft(project, { role, userId: actorUserId }, S.cases.some((x) => project.sources.includes(x.id) && isPrivateIdea(x))))) {
    status = <Link href={href("/projects/" + project.id)}>{approval.state === "approved" ? t("approvals.approversDecided") : t("team.ideaKindOpenProject")} →</Link>;
  }

  const sendWhy = () => {
    const why = text.trim();
    if (!why) return;
    if (lead) { act.affect(c.id, why); showToast(t("dashboard.detailNoted", { kind: t(c.kind === "idea" ? "dashboard.detailKindIdea" : "dashboard.detailKindProblem") })); }
    else { act.rescore(c.id, why); showToast(t("dashboard.detailRescored")); }
    setForm(null);
  };
  const formOf = (): React.ReactNode => {
    if (form === "withdraw") return (
      <div className={styles.form} role="group" aria-label={t("dashboard.detailWithdraw")}>
        <input className={styles.field} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus aria-label={t("dashboard.detailWithdrawWhy")} placeholder={t("dashboard.detailWithdrawWhy")} onKeyDown={(e) => { if (e.key === "Escape") setForm(null); }} />
        <div className={styles.formRow}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" data-testid="case-withdraw-confirm" onClick={() => { act.withdraw(c.id, text.trim()); setForm(null); showToast(t("dashboard.detailWithdrawDone")); }}>{t("dashboard.detailWithdrawConfirm")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setForm(null)}>{t("common.cancel")}</button>
        </div>
      </div>
    );
    if (form === "why") return (
      <div className={styles.form} role="group" aria-label={lead ? t("dashboard.detailWhyAffects") : t("dashboard.detailWhatIsNew")}>
        <input className={styles.field} value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={lead ? t("dashboard.detailWhyAffects") : t("dashboard.detailWhatIsNew")}
          placeholder={lead ? t("dashboard.detailWhyPlaceholder") : t("dashboard.detailNewPlaceholder")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendWhy(); } if (e.key === "Escape") setForm(null); }} />
        <div className={styles.formRow}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={sendWhy} disabled={!text.trim()}>{lead ? t("dashboard.detailConfirm") : t("dashboard.detailReevaluateShort")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setForm(null)}>{t("common.cancel")}</button>
        </div>
      </div>
    );
    if (form === "desk") return (
      <div className={styles.form} role="group" aria-label={t("loopCase.moveDesk")}>
        <select className={styles.field} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("loopCase.moveDeskLabel")} autoFocus>
          <option value="">{t("loopCase.moveDeskPick")}</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.type}</option>)}
        </select>
        <div className={styles.formRow}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!to} data-testid="case-move-desk-send" onClick={() => { act.override(c.id, c.route?.id ?? null, to); setForm(null); showToast(t("loopCase.moveDesk")); }}>{t("loopCase.moveDeskSend")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setForm(null)}>{t("common.cancel")}</button>
        </div>
      </div>
    );
    return null;
  };

  // While a move's form is open, its send button is the one filled button.
  const sorted = form === null ? sortMoves(moves, rec) : { primary: null, quiet: [], more: [] };
  return <YourMove status={status} quote={form === null ? quote : null} moves={sorted} name="idea">{formOf()}</YourMove>;
}
