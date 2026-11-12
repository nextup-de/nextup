"use client";
// The Agent tab's data for one project (plan AGT, D15, D18): the agent's state reduced from the log the page already has, and the words of the
// open suggestions, read through the server action only while the tab is open (never on a page load of another tab). Nothing here calls a model.
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { agentTabOf, type AgentTab } from "@/features/agent/view";
import { agentStateOf } from "@/features/agent/reduce";
import type { SuggestionText } from "@/features/agent/types";
import type { ReducedProject } from "@/features/projects/types";
import { loadSuggestionTextsAction } from "@/server/agent/actions";

/** The tab, or null when this person has none on this page; `failed` when the words could not be read. `load`: the tab is the one on show. */
export function useAgentTab(p: ReducedProject, load: boolean): { view: AgentTab | null; failed: boolean } {
  const ctx = useDemo();
  const { log, S, tenant, serverMode } = ctx;
  const flagOn = ctx.flag("agent");
  // The static demo and the demo stage have no agent (D8): no state is reduced for them.
  const real = flagOn && serverMode && !ctx.demo;
  const agent = useMemo(() => (real ? agentStateOf(log, S) : null), [real, log, S]);
  const openIds = (agent?.projects[p.id]?.suggestions ?? []).filter((s) => s.status === "open").map((s) => s.id).join(",");
  const [read, setRead] = useState<{ key: string; texts: Record<string, SuggestionText | null> | null } | null>(null);
  const key = tenant.slug + ":" + p.id + ":" + openIds;
  useEffect(() => {
    if (!load || !real || openIds === "") return;
    let live = true;
    void loadSuggestionTextsAction(tenant.slug, p.id).then((r) => { if (live) setRead({ key, texts: r.ok ? r.texts : null }); }, () => { if (live) setRead({ key, texts: null }); });
    return () => { live = false; };
  }, [load, real, openIds, tenant.slug, p.id, key]);
  // Words read for another set of open suggestions are not these ones' words.
  const current = read !== null && read.key === key ? read : null;
  const view = useMemo(
    () => agent === null ? null : agentTabOf({
      viewer: { userId: ctx.actorUserId, role: ctx.role, me: ctx.me }, p, agent, texts: openIds === "" ? {} : current?.texts ?? null,
      flagOn, serverMode: real, gateOn: true, log,
    }),
    [agent, ctx.actorUserId, ctx.role, ctx.me, p, openIds, current, flagOn, real, log],
  );
  return { view, failed: current !== null && current.texts === null };
}
