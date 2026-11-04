"use client";

import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DeptChip, PersonFace, SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import styles from "./PersonView.module.css";

/** The minimal directory entry: name, role and unit path. No contact data, counts or colleagues. */
export function PersonView({ name, role, unitPath }: { name: string; role: string; unitPath: string[] }) {
  const t = useT();
  const { href } = useDemo();
  return <div className={styles.page} data-testid="person-page">
    <Link href={href("/overview")} className={styles.back}>{t("people.back")}</Link>
    <SectionCard name="person">
      <section className={styles.hero} aria-labelledby="person-name">
        <PersonFace name={name} />
        <div className={styles.text}>
          <h1 id="person-name" data-testid="person-name" className={styles.name}>{name}</h1>
          <p data-testid="person-role"><span className={styles.label}>{t("people.role")}</span> {role}</p>
          {unitPath.length > 0 && <p data-testid="person-unit"><span className={styles.label}>{t("people.unit")}</span> {unitPath.map((unit, i) => <span key={i}>{i > 0 && <span className={styles.sep} aria-hidden="true"> › </span>}<DeptChip name={unit} /></span>)}</p>}
        </div>
      </section>
    </SectionCard>
  </div>;
}
