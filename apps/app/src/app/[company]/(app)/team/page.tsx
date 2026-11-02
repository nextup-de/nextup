// TEAM MEMBER: what happened to what I sent. One card per problem or idea this person raised - the four
// steps, who has it, the date they owe an answer, what they said, what it changed.
import { SentView } from "@/components/dashboard/team/SentView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.whatISent") };
}
export default function TeamSentPage() {
  return <SentView />;
}
