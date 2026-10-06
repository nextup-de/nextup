// The static demo (docs/IDEAS.md "The demo page"): NextUp on made-up data, for showing people how it
// works. No company, no login, no database - everything happens in the visitor's browser and starts
// over on every visit (components/demo/StaticDemo.tsx). Lives at /demo, outside every company - or at
// the root of a stack that is the demo (demo.sellux.ch), which the proxy rewrites onto /demo.
import { StaticDemo } from "@/components/demo/StaticDemo";
import { seedTemplate } from "@/features/demo";
import { staticDemoPrefix } from "@/features/tenant/urls";

// Where the links point depends on the stack it runs on (env), not on the build.
export const dynamic = "force-dynamic";
export const metadata = { title: { template: "%s · NextUp demo", default: "NextUp demo" }, robots: { index: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <StaticDemo seed={seedTemplate("demo")} prefix={staticDemoPrefix()}>{children}</StaticDemo>;
}
