// A console table for a list of any length: a search box and pages, so one long table never pushes the
// next card off the screen. Not a client file on purpose: a server page can use it too, because every
// cell is rendered here and only the finished cells travel to the browser (SearchTableView).
import type { Column } from "@/components/ui/elements";
import { SearchTableView } from "./SearchTableView";

export function SearchTable<Row>({ columns, rows, rowKey, searchText, empty, pageSize, testId }: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Everything a person might type to find this row. */
  searchText: (row: Row) => string;
  empty: string;
  pageSize?: number;
  testId?: string;
}) {
  return (
    <SearchTableView
      heads={columns.map(({ key, header, width }) => ({ key, header, width }))}
      rows={rows.map((row) => ({ key: rowKey(row), text: searchText(row), cells: Object.fromEntries(columns.map((c) => [c.key, c.render(row)])) }))}
      empty={empty}
      pageSize={pageSize}
      testId={testId}
    />
  );
}
