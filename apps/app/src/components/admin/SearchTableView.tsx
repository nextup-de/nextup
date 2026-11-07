"use client";
// The browser half of SearchTable. A list that fits on one page shows no search box and no pager.
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/ui/elements";
import { matchesSearch, pageOf } from "@/features/admin/list";
import { useT } from "@/i18n/client";
import s from "./lists.module.css";

type Row = { key: string; text: string; cells: Record<string, React.ReactNode> };
type Head = Pick<Column<Row>, "key" | "header" | "width">;

export function SearchTableView({ heads, rows, empty, pageSize = 10, testId }: {
  heads: readonly Head[]; rows: readonly Row[]; empty: string; pageSize?: number; testId?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const found = useMemo(() => rows.filter((r) => matchesSearch(r.text, query)), [rows, query]);
  const view = pageOf(found, page, pageSize);
  const columns = heads.map((h) => ({ ...h, render: (r: Row) => r.cells[h.key] }));
  return (
    <div className={s.tableBox}>
      {rows.length > pageSize ? (
        <input
          className={s.tableSearch}
          type="search"
          value={query}
          placeholder={t("adminConsole.tableSearch")}
          aria-label={t("adminConsole.tableSearch")}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
        />
      ) : null}
      <DataTable
        columns={columns}
        rows={view.rows}
        rowKey={(r) => r.key}
        empty={query ? t("adminConsole.tableNoMatch") : empty}
        testId={testId}
        paging={view.pages > 1 ? {
          line: t("adminConsole.tablePager", { from: view.from, to: view.to, total: view.total }),
          prevLabel: t("adminConsole.tablePrev"),
          nextLabel: t("adminConsole.tableNext"),
          onPrev: view.page > 0 ? () => setPage(view.page - 1) : undefined,
          onNext: view.page < view.pages - 1 ? () => setPage(view.page + 1) : undefined,
        } : undefined}
      />
    </div>
  );
}
