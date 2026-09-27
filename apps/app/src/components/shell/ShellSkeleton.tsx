"use client";
// The chrome as grey boxes: what /[company]/* shows while the app layout is still reading the
// company and its log out of Postgres - before DemoProvider exists, so nothing here may use it.
// Same bar and content frame as SimpleShell, so the real shell lands on top without a jump.
import Image from "next/image";
import { usePathname } from "next/navigation";
import { SITE } from "@/config/site";
import { PageSkeleton, skeletonKindForPathname } from "@/components/dashboard/shared/PageSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Ground } from "./Ground";
import styles from "./SimpleShell.module.css";

export function ShellSkeleton() {
  const kind = skeletonKindForPathname(usePathname());
  return (
    <div className={styles.root}>
      <Ground />
      <header className={styles.bar} aria-hidden="true">
        <span className={styles.brand}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} className={styles.logo} priority />
        </span>
        <span className={styles.nav}>
          <Skeleton w={84} h={32} r="pill" />
          <Skeleton w={96} h={32} r="pill" />
        </span>
        <span className={styles.right}>
          <Skeleton w={32} h={32} r="circle" />
        </span>
      </header>
      <main className={styles.content}>
        <div className={styles.contentInner}>
          <PageSkeleton kind={kind} />
        </div>
      </main>
    </div>
  );
}
