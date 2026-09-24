import Link from "next/link";
import { PageHeader } from "@/components/ui";

const TABS = [
  { href: "/settings", label: "Profile & consents" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/privacy", label: "Data & privacy" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Settings" title="Settings" />
      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="chip px-3 py-1.5 hover:border-glow">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
