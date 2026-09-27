import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Browser-side guard rails (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
// "Without Nonces"). Everything the app loads is its own: fonts are self-hosted by next/font, there
// are no third-party scripts (CLAUDE.md), so 'self' is the whole allow-list. 'unsafe-inline' for
// scripts is what Next's own hydration needs without nonces; nonces would force every page dynamic.
// No upgrade-insecure-requests: it would break the plain-http laptop setup (http://localhost).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nobody may frame the app: a login or a "delete company" button inside someone else's page
  // is how clickjacking works.
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore HSTS over plain http, so sending it everywhere is safe; over https it pins
  // the host to https for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Self-hosting on the Hetzner box: emits .next/standalone with its own minimal server.js and
  // only the node_modules it actually traced, so the runtime image needs no npm install.
  // `public` and `.next/static` are NOT included by this - ops/Dockerfile copies them itself.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
