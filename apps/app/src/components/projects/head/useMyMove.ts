"use client";
// The viewer's next move on a project, in words: the head's "Your move" banner and, while the sidebar carries the head,
// the line under the project's title there. Null when the move is not theirs.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { holdsRole } from "@/features/auth/identity";
import { nextMove } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { moveLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useRights } from "../parts";

export function useMyMove(p: ReducedProject): { label: string; text: string } | null {
  const ctx = useDemo();
  const r = useRights(p);
  const t = useT();
  const locale = useLocale();
  const move = nextMove(p, ctx.S.day);
  const mine = move !== null && (move === "reward" ? r.reward : ctx.actorUserId !== null && p.leadUserId === ctx.actorUserId);
  const escalatedToMe = holdsRole(ctx.me, p.escalated?.toRoleId ?? null);
  if ((!mine && !escalatedToMe) || !move) return null;
  const moved = escalatedToMe && !mine;
  return {
    label: moved ? t("projects.movedToYou") : t("projects.yourMove"),
    text: moved ? (p.escalated?.what === "start" ? t("projects.lateStartOnDesk") : t("projects.lateMeasureOnDesk")) : moveLabel(move, locale),
  };
}
