// Pairing a shared device with the code an admin made (FLR-D1). No session: the code is the proof.
// A plain page; the floor layout (FLR-B1) wraps it once it exists.
import { PairForm } from "@/components/floor/PairForm";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("floorDevices.pairTitle") };
}

export default async function FloorPairPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const t = await getT();
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
      <h1>{t("floorDevices.pairTitle")}</h1>
      <p className="nh-hint">{t("floorDevices.pairHint")}</p>
      <PairForm slug={company} />
    </main>
  );
}
