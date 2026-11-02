import Link from "next/link";
import { logout } from "@/app/actions";

type NavItem = { href: string; label: string };

export default function AppShell({
  title, subtitle, nav, userName, children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="mr-auto">
            <div className="font-semibold">{title}</div>
            {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
          </div>
          <nav className="flex flex-wrap gap-4 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-gray-700 hover:text-blue-700">{n.label}</Link>
            ))}
          </nav>
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{userName}</span>
            <button className="btn btn-secondary py-1">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
