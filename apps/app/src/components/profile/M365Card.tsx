// "Microsoft 365" on a person's own profile: connect their files for the assistant, or disconnect.
// Props in, JSX out; connecting is a link to the Microsoft flow, disconnecting a server action.
import type { M365Card as Card } from "@/server/m365-profile";
import { disconnectM365Action } from "@/server/actions/m365";
import profile from "./ProfileView.module.css";
import styles from "./M365Card.module.css";

export function M365Card({ card }: { card: Card }) {
  const connected = card.connectedAt !== null;
  return (
    <section className={profile.card} aria-labelledby="m365-title">
      <div className={profile.sectionHead}><h2 id="m365-title">Microsoft 365</h2>{connected ? <span className={styles.state}>{card.renew ? "Renew" : "Connected"}</span> : null}</div>
      <div className={styles.body}>
        {card.notice ? <p className={card.notice.tone === "error" ? styles.error : styles.ok} role={card.notice.tone === "error" ? "alert" : "status"}>{card.notice.text}</p> : null}
        <p>
          {connected
            ? `Since ${card.connectedAt}, the assistant can search the files you can open in SharePoint and OneDrive. It reads them as you, so it never sees more than you do, and nothing is copied into NextUp.`
            : "Let the assistant search the files you can open in SharePoint and OneDrive when you ask it something. It reads them as you, so it never sees more than you do, and nothing is copied into NextUp. Mail, chats and calendars stay out."}
        </p>
        {card.renew ? <p className={styles.error}>Microsoft no longer accepts the connection. Connect again to keep using it.</p> : null}
        <div className={styles.actions}>
          {card.available && (!connected || card.renew) ? <a className="nh-btn nh-btn-primary" href={card.connectHref}>{connected ? "Connect again" : "Connect Microsoft 365"}</a> : null}
          {connected ? (
            <form action={disconnectM365Action}>
              <input type="hidden" name="slug" value={card.slug} />
              <button type="submit" className="nh-btn">Disconnect</button>
            </form>
          ) : null}
        </div>
        {!card.available && !card.notice ? <p className={styles.note}>Your company has switched Microsoft 365 search off.</p> : null}
      </div>
    </section>
  );
}
