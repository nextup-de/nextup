// TEAM MEMBER home: raise an idea. One line, then NextUp evaluates it, the coach grills you on what is
// missing, you review the analysis and publish it to the right desk. docs/IDEAS.md.
import { Raise } from "@/components/ideas/Raise";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.metaRaise") };
}
export default function RaisePage() {
  return <Raise />;
}
