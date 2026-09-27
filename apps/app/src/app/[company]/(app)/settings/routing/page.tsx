// The routing table (~15 decision types): owner, deputy, buddy, keywords. Filled once by a
// department head. Read-only from the seed until settings store events (Phase 3).
import { seedFor } from "@/features/demo";
import { deptName } from "@/lib/utils/format";
import styles from "./page.module.css";

export const metadata = { title: "Routing table" };

export default async function RoutingSettingsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const seed = await seedFor(company);
  return (
    <>
      <h1>Routing table</h1>
      <p className="nh-hint">Recurring request type → owning role · deputy · buddy in the neighbouring department. The intake box matches typed text against the keywords and proposes the row — it never decides.</p>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Request type</th><th>Owner</th><th>Deputy</th><th>Buddy</th><th>Typical wait</th><th>Keywords</th></tr>
          </thead>
          <tbody>
            {seed.routes.map((r) => (
              <tr key={r.id}>
                <td className={styles.type}>{r.type}</td>
                <td>{r.owner.name}<span className={styles.sub}>{r.owner.role} · {deptName(seed.depts, r.owner.dept)}</span></td>
                <td>{r.deputy}</td>
                <td>{r.buddy}</td>
                <td className={styles.mono}>{r.wait}</td>
                <td className={styles.keys}>{r.keys.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {seed.routes.length === 0 && <p className="nh-hint">No routes yet. The department head fills this in once; the map grows from every overruled proposal.</p>}
      </div>
    </>
  );
}
