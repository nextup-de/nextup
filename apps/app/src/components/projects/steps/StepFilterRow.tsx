"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PersonFace } from "@/components/ui/elements";
import type { StepFilter } from "@/features/projects/step-filter";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { headRowId } from "../tools/heads";
import styles from "./StepFilterRow.module.css";

export type FilterOwner = { userId: string; name: string };
export type StepFilterRowProps = {
  /** The search field's label and placeholder: 'Search this board' or 'Search this list'. */
  search: MessageKey;
  filter: StepFilter;
  onFilter: (next: StepFilter) => void;
  owners: FilterOwner[];
  waitingCount: number;
  /** The board's By status / By person switch; the list has none. */
  group?: { value: "status" | "person"; onChange: (next: "status" | "person") => void };
  /** Where the row goes: into the page header when this tool is the page's first, else here, above the tool. */
  page: ProjectPage;
  tool: ToolInstance;
};

const TOGGLES = [
  ["mine", "projectSteps.onlyMine"], ["waiting", "projectSteps.waiting"], ["dueWeek", "projectSteps.dueWeek"], ["notStarted", "projectSteps.notStarted"], ["dropped", "projectSteps.dropped"],
] as const satisfies readonly (readonly [keyof StepFilter, MessageKey])[];

/** The page header's filter slot, once it is on the page (the server render has none, so the row starts in place). */
function useSlot(pageId: string): HTMLElement | null {
  return useSyncExternalStore(() => () => {}, () => document.getElementById(headRowId(pageId)), () => null);
}

export function StepFilterRow({ search, filter, onFilter, owners, waitingCount, group, page, tool }: StepFilterRowProps): ReactNode {
  const t = useT();
  const slot = useSlot(page.id);
  const toggleOwner = (id: string) => onFilter({ ...filter, owners: filter.owners.includes(id) ? filter.owners.filter((x) => x !== id) : [...filter.owners, id] });
  const row = <div className={styles.row} data-testid="step-filter-row">
    <input type="search" className={`nh-input ${styles.search}`} aria-label={t(search)} placeholder={t(search)} value={filter.query} onChange={(e) => onFilter({ ...filter, query: e.target.value })} />
    <div className={styles.faces} role="group" aria-label={t("projectSteps.owner")}>
      {owners.map((owner) => <button type="button" key={owner.userId} className={styles.face} aria-label={t("projectSteps.filterOwner", { name: owner.name })} aria-pressed={filter.owners.includes(owner.userId)} onClick={() => toggleOwner(owner.userId)}><PersonFace name={owner.name} size="sm" /></button>)}
    </div>
    <div className={styles.toggles} role="group" aria-label={t("projectSteps.filterLabel")}>
      {TOGGLES.map(([key, label]) => <button type="button" key={key} className={styles.control} aria-pressed={filter[key]} onClick={() => onFilter({ ...filter, [key]: !filter[key] })}>{t(label)}{key === "waiting" && waitingCount > 0 && <span className={styles.count}>{waitingCount}</span>}</button>)}
    </div>
    {group && <div className={styles.segmented} role="group" aria-label={t("projectSteps.groupBy")}>
      {(["status", "person"] as const).map((by) => <button type="button" key={by} className={styles.control} aria-pressed={group.value === by} onClick={() => group.onChange(by)}>{t(by === "status" ? "projectSteps.byStatus" : "projectSteps.byPerson")}</button>)}
    </div>}
  </div>;
  return slot && page.tools[0]?.id === tool.id ? createPortal(row, slot) : row;
}
