// /admin/assistant (company stack): live Microsoft 365 search for this company - the switch, how many
// people are connected (a count only: no list of who, BetrVG §87), and the way to disconnect everyone.
// Props in, JSX out.
import { disconnectEveryoneAction, setM365SearchAction } from "@/server/actions/m365";
import type { M365AdminView } from "@/server/m365-admin";
import styles from "@/app/admin/admin.module.css";

export function M365Admin({ view: v }: { view: M365AdminView }) {
  const ready = v.microsoft && v.vault;
  return (
    <section className={styles.card}>
      <h2>Microsoft 365 search</h2>
      <p className="nh-hint">
        People can connect their own Microsoft 365 account on their profile. The assistant then searches the
        SharePoint and OneDrive files that person can open, as that person; nothing is copied into NextUp.
        Your IT approves NextUp for Files.Read.All once (docs/customer/ENTRA_SETUP.md).
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>Search</th><td>{v.on ? "On" : "Off"} <span className={styles.sub}>off stops new connections</span></td></tr>
            <tr><th>Connected</th><td>{v.connected} {v.connected === 1 ? "person" : "people"}</td></tr>
            <tr><th>Microsoft sign-in</th><td>{v.microsoft ? "set up" : <span className={styles.warn}>not set up - needs the Entra app and this company&apos;s tenant</span>}</td></tr>
            <tr><th>Token vault</th><td>{v.vault ? "set up" : <span className={styles.warn}>CONNECTOR_VAULT_KEY is missing - nobody can connect</span>}</td></tr>
          </tbody>
        </table>
      </div>
      <form action={setM365SearchAction} className={styles.grid}>
        <input type="hidden" name="m365Search" value={v.on ? "off" : "on"} />
        <button type="submit" className={v.on ? "nh-btn" : "nh-btn nh-btn-primary"} disabled={!v.on && !ready}>
          {v.on ? "Turn off" : "Turn on"}
        </button>
      </form>
      {v.connected > 0 ? (
        <form action={disconnectEveryoneAction} className={styles.grid}>
          <button type="submit" className="nh-btn">Disconnect everyone ({v.connected})</button>
        </form>
      ) : null}
    </section>
  );
}
