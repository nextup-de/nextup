// The static demo's app: the app's own pages over the made-up seed, everything in the visitor's browser,
// starting over on every visit (components/demo/StaticDemo.tsx).
import { StaticDemo } from "@/components/demo/StaticDemo";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";
import { staticDemoPrefix } from "@/features/tenant/urls";

export default function DemoAppLayout({ children }: { children: React.ReactNode }) {
  return <StaticDemo seed={STATIC_DEMO_SEED} prefix={staticDemoPrefix()}>{children}</StaticDemo>;
}
