// The move view of the open project for whoever is looking (features/projects/move-view.ts), asked with the demo's own state.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { moveView, type MoveView } from "@/features/projects/move-view";
import type { ReducedProject } from "@/features/projects/types";
import { useLocale } from "@/i18n/client";
import { actorOf } from "../parts";

export function useMoveView(p: ReducedProject): MoveView {
  const ctx = useDemo();
  const locale = useLocale();
  return moveView(p, ctx.S, actorOf(ctx), ctx.S.day, locale);
}
