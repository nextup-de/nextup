// The raise page with the demo script: the demo controls fill the sample idea and its answers, the coach
// gives its prepared replies, then publish it (features/ideas/demo-script.ts).
import { Raise } from "@/components/ideas/Raise";
export const metadata = { title: "Raise" };
export default function DemoRaisePage() {
  return <Raise script />;
}
