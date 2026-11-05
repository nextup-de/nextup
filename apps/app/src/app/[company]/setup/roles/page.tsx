import { setupMetadata, SetupStepPage, type SetupPageProps } from "../step-page";

export const generateMetadata = setupMetadata;

export default function Page(props: SetupPageProps) {
  return <SetupStepPage {...props} step="roles" />;
}
