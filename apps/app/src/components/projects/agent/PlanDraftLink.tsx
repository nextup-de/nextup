"use client";
// On a draft project whose case has a planning draft (plan AGT, D19): a link to the case, where the draft is shown read-only and labelled AI
// (AGT-U2's panel). Only for who may know that a draft exists (D15: the desk, managers, the people invited to the discussion, the raiser).
import Link from "next/link";
import { useMemo } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { maySeePlanExists } from "@/features/agent/permissions";
import { agentStateOf } from "@/features/agent/reduce";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import styles from "./Agent.module.css";

export function PlanDraftLink({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const t = useT();
  const { S, log, href } = ctx;
  const real = ctx.flag("agent") && ctx.serverMode && !ctx.demo;
  const agent = useMemo(() => (real ? agentStateOf(log, S) : null), [real, log, S]);
  const kase = S.cases.find((c) => p.sources.includes(c.id));
  if (!agent || !kase || (agent.plans[kase.id]?.length ?? 0) === 0) return null;
  if (!maySeePlanExists({ userId: ctx.actorUserId, role: ctx.role, me: ctx.me }, kase, ctx.seed.seats ?? [])) return null;
  return (
    <p className={styles.hint} data-testid="plan-draft-link">
      <Link href={href("/cases/" + kase.id)} className={styles.link}>{t("projectAgent.planLink")}</Link>
    </p>
  );
}
