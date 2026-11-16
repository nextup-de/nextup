"use client";
import type { ReactNode } from "react";
import { PersonFace } from "@/components/ui/elements";
import type { StepFilter } from "@/features/projects/step-filter";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { HeadSlot } from "../tools/HeadSlot";
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
  /** Stay where the tool draws it, never in the page header: the List keeps its row inside its table card (Paper). */
  inline?: boolean;
};

const TOGGLES = [
  ["mine", "projectSteps.onlyMine"], ["waiting", "projectSteps.waiting"], ["dueWeek", "projectSteps.dueWeek"], ["notStarted", "projectSteps.notStarted"], ["dropped", "projectSteps.dropped"],
] as const satisfies readonly (readonly [keyof StepFilter, MessageKey])[];

export function StepFilterRow({ search, filter, onFilter, owners, waitingCount, group, page, tool, inline }: StepFilterRowProps): ReactNode {
  const t = useT();
  const toggleOwner = (id: string) => onFilter({ ...filter, owners: filter.owners.includes(id) ? filter.owners.filter((x) => x !== id) : [...filter.owners, id] });
  const row = <div className={styles.row} data-testid="step-filter-row">
    <label className={styles.search}>
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
      <input type="search" aria-label={t(search)} placeholder={t(search)} value={filter.query} onChange={(e) => onFilter({ ...filter, query: e.target.value })} />
    </label>
    <div className={styles.faces} role="group" aria-label={t("projectSteps.owner")}>
      {owners.map((owner) => <button type="button" key={owner.userId} className={styles.face} aria-label={t("projectSteps.filterOwner", { name: owner.name })} aria-pressed={filter.owners.includes(owner.userId)} onClick={() => toggleOwner(owner.userId)}><PersonFace name={owner.name} size="sm" /></button>)}
    </div>
    <div className={styles.toggles} role="group" aria-label={t("projectSteps.filterLabel")}>
      {TOGGLES.map(([key, label]) => <button type="button" key={key} className={styles.control} aria-pressed={filter[key]} onClick={() => onFilter({ ...filter, [key]: !filter[key] })}>{t(label)}{key === "waiting" && waitingCount > 0 && <span className={styles.count}>{waitingCount}</span>}</button>)}
    </div>
    <span className={styles.spacer} />
    {group && <div className={styles.segmented} role="group" aria-label={t("projectSteps.groupBy")}>
      {(["status", "person"] as const).map((by) => <button type="button" key={by} className={styles.segment} aria-pressed={group.value === by} onClick={() => group.onChange(by)}>{t(by === "status" ? "projectSteps.byStatus" : "projectSteps.byPerson")}</button>)}
    </div>}
  </div>;
  return inline ? row : <HeadSlot page={page} tool={tool}>{row}</HeadSlot>;
}
