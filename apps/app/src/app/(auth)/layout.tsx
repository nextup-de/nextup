// Global auth pages (before a company is known). Each page renders its own AuthShell so the side panel can differ.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
