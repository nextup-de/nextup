// "Microsoft 365" on a person's own profile: connect their files for the assistant, or disconnect.
// Props in, JSX out; connecting is a link to the Microsoft flow, disconnecting a server action.
"use client";

import { useT } from "@/i18n/client";
import type { M365Card as Card } from "@/server/m365-profile";
import { disconnectM365Action } from "@/server/actions/m365";
import profile from "./ProfileView.module.css";
import styles from "./M365Card.module.css";

// A product name, not a sentence: it is spelled the same in every language.
const PRODUCT = "Microsoft 365";

export function M365Card({ card }: { card: Card }) {
  const t = useT();
  const connected = card.connectedAt !== null;
  return (
    <section className={profile.card} aria-labelledby="m365-title">
      <div className={profile.sectionHead}><h2 id="m365-title">{PRODUCT}</h2>{connected ? <span className={styles.state}>{card.renew ? t("profile.m365Renew") : t("profile.m365Connected")}</span> : null}</div>
      <div className={styles.body}>
        {card.notice ? <p className={card.notice.tone === "error" ? styles.error : styles.ok} role={card.notice.tone === "error" ? "alert" : "status"}>{card.notice.text}</p> : null}
        <p>
          {connected
            ? t("profile.m365ConnectedText", { since: card.connectedAt ?? "" })
            : t("profile.m365Offer")}
        </p>
        {card.renew ? <p className={styles.error}>{t("profile.m365Refused")}</p> : null}
        <div className={styles.actions}>
          {card.available && (!connected || card.renew) ? <a className="nh-btn nh-btn-primary" href={card.connectHref}>{connected ? t("profile.m365ConnectAgain") : t("profile.m365Connect")}</a> : null}
          {connected ? (
            <form action={disconnectM365Action}>
              <input type="hidden" name="slug" value={card.slug} />
              <button type="submit" className="nh-btn">{t("profile.m365Disconnect")}</button>
            </form>
          ) : null}
        </div>
        {!card.available && !card.notice ? <p className={styles.note}>{t("profile.m365Off")}</p> : null}
      </div>
    </section>
  );
}
