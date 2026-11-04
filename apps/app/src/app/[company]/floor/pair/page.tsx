// Pairing a shared device with the code an admin made (FLR-D1). No session: the code is the proof.
// The floor layout wraps it in the phone shell.
import { PairForm } from "@/components/floor/PairForm";
import styles from "@/components/floor/Floor.module.css";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("floorDevices.pairTitle") };
}

export default async function FloorPairPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{t("floorDevices.pairTitle")}</h1>
      <p className={styles.hint}>{t("floorDevices.pairHint")}</p>
      <PairForm slug={company} />
    </div>
  );
}
