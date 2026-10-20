// The data map on /admin/company-data: where a company's data comes from, which table holds it, and which
// part of NextUp reads it. A static list, so adding a source means adding a line here - the map
// cannot drift from a hand-drawn picture. Checked against the code by tests/unit/admin-data.test.ts.
//
// Readers, as of 21 Oct 2026: the router reads the routing table through the seed overlay
// (features/knowledge overlayKnowledge); the assistant and the idea coach get companyBrief() and
// the assistant searches documents under the ceiling (features/assist); the dashboards read cases.

export type MapColumn = "from" | "stored" | "read";

export type MapNode = { id: string; label: string; detail: string; column: MapColumn };

export const DATA_MAP: { nodes: readonly MapNode[]; edges: readonly (readonly [string, string])[] } = {
  nodes: [
    { id: "entra", label: "Microsoft Entra", detail: "sign-in", column: "from" },
    { id: "admin", label: "Company admin", detail: "roles, routing, goals", column: "from" },
    { id: "n8n", label: "n8n", detail: "ERP, Jira, mail", column: "from" },
    { id: "people", label: "Employees", detail: "raises, ideas", column: "from" },

    { id: "User", label: "People", detail: "User", column: "stored" },
    { id: "Org", label: "Org chart", detail: "OrgUnit · OrgRole", column: "stored" },
    { id: "RoutingRule", label: "Routing table", detail: "RoutingRule", column: "stored" },
    { id: "Goal", label: "Goals", detail: "Goal", column: "stored" },
    { id: "Document", label: "Documents", detail: "Document · TISAX class", column: "stored" },
    { id: "CaseEvent", label: "Cases & projects", detail: "CaseEvent", column: "stored" },

    { id: "router", label: "Router", detail: "keywords, brain", column: "read" },
    { id: "assistant", label: "Assistant", detail: "brief + documents", column: "read" },
    { id: "coach", label: "Idea coach", detail: "brief + documents", column: "read" },
    { id: "dashboards", label: "Dashboards & inbox", detail: "cases", column: "read" },
  ],
  edges: [
    ["entra", "User"],
    ["admin", "Org"],
    ["admin", "RoutingRule"],
    ["admin", "Goal"],
    ["admin", "Document"],
    ["n8n", "Document"],
    ["n8n", "CaseEvent"],
    ["people", "CaseEvent"],

    ["RoutingRule", "router"],
    ["Org", "router"],
    ["CaseEvent", "router"],
    ["Org", "assistant"],
    ["RoutingRule", "assistant"],
    ["Goal", "assistant"],
    ["Document", "assistant"],
    ["Org", "coach"],
    ["Goal", "coach"],
    ["Document", "coach"],
    ["User", "dashboards"],
    ["CaseEvent", "dashboards"],
  ],
};

export const COLUMN_TITLE: Record<MapColumn, string> = { from: "Comes from", stored: "Stored in", read: "Read by" };

export type Placed = MapNode & { x: number; y: number };
export type Line = { from: string; to: string; x1: number; y1: number; x2: number; y2: number };
export type MapLayout = { width: number; height: number; nodeWidth: number; nodeHeight: number; nodes: Placed[]; lines: Line[] };

const COLUMNS: readonly MapColumn[] = ["from", "stored", "read"];

/**
 * Boxes in three columns, each column centred on the tallest; a line from the right edge of the
 * source to the left edge of the target. Edges whose ends are missing are dropped, not drawn to 0,0.
 */
export function mapLayout(map = DATA_MAP, size = { nodeWidth: 200, nodeHeight: 52, gapX: 90, gapY: 14, top: 34 }): MapLayout {
  const { nodeWidth, nodeHeight, gapX, gapY, top } = size;
  const byColumn = COLUMNS.map((c) => map.nodes.filter((n) => n.column === c));
  const tallest = Math.max(...byColumn.map((ns) => ns.length));
  const columnHeight = (n: number) => n * nodeHeight + Math.max(0, n - 1) * gapY;
  const height = top + columnHeight(tallest);

  const nodes: Placed[] = byColumn.flatMap((ns, ci) => {
    const offset = top + (columnHeight(tallest) - columnHeight(ns.length)) / 2;
    return ns.map((n, i) => ({ ...n, x: ci * (nodeWidth + gapX), y: offset + i * (nodeHeight + gapY) }));
  });
  const at = new Map(nodes.map((n) => [n.id, n]));

  const lines: Line[] = map.edges.flatMap(([from, to]) => {
    const a = at.get(from);
    const b = at.get(to);
    if (!a || !b) return [];
    return [{ from, to, x1: a.x + nodeWidth, y1: a.y + nodeHeight / 2, x2: b.x, y2: b.y + nodeHeight / 2 }];
  });

  return { width: COLUMNS.length * nodeWidth + (COLUMNS.length - 1) * gapX, height, nodeWidth, nodeHeight, nodes, lines };
}
