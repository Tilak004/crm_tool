import { logout } from "@/app/actions";
import { BottomNav, TopNav, type NavItem } from "@/components/NavLinks";

export default function AppShell({
  title, subtitle, nav, userName, phoneTabs, children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  userName: string;
  /** When given, phones get a bottom tab bar with these instead of the top links. */
  phoneTabs?: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="mr-auto min-w-0">
            <div className="truncate font-semibold">{title}</div>
            {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
          </div>
          <TopNav items={nav} hideOnPhone={!!phoneTabs} />
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-500 sm:inline">{userName}</span>
            <button className="btn btn-secondary py-1">Log out</button>
          </form>
        </div>
      </header>
      <main className={`mx-auto max-w-6xl px-4 py-6 ${phoneTabs ? "pb-24 sm:pb-6" : ""}`}>{children}</main>
      {phoneTabs && <BottomNav items={phoneTabs} />}
    </div>
  );
}
