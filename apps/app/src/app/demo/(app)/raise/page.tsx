// The raise page with the demo script: the demo controls fill the sample idea and its answers, the coach
// gives its prepared replies, then publish it (features/ideas/demo-script.ts).
import { getT } from "@/i18n/server";
import { Raise } from "@/components/ideas/Raise";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleRaise") };
}
export default function DemoRaisePage() {
  return <Raise script />;
}
