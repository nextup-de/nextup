"use client";

import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { avatarTone } from "@/lib/avatar";
import { useT } from "@/i18n/client";
import styles from "./PersonView.module.css";

const initials = (name: string) => name.split(/[.\s]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

/** The minimal directory entry: name, role and unit path. No contact data, counts or colleagues. */
export function PersonView({ name, role, unitPath }: { name: string; role: string; unitPath: string[] }) {
  const t = useT();
  const { href } = useDemo();
  return <div className={styles.page} data-testid="person-page">
    <Link href={href("/overview")} className={styles.back}>{t("people.back")}</Link>
    <section className={styles.hero} aria-labelledby="person-name">
      <span className={styles.avatar} data-avatar={avatarTone(name)} aria-hidden="true">{initials(name)}</span>
      <div className={styles.text}>
        <h1 id="person-name" data-testid="person-name">{name}</h1>
        <p data-testid="person-role"><span className={styles.label}>{t("people.role")}</span> {role}</p>
        {unitPath.length > 0 && <p data-testid="person-unit"><span className={styles.label}>{t("people.unit")}</span> {unitPath.join(" › ")}</p>}
      </div>
    </section>
  </div>;
}
