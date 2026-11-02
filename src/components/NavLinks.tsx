"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon?: keyof typeof ICONS };

// Simple 24px outline icons for the phone tab bar.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  sales: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6",
  activity: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  hsn: "M4 7h16M4 12h16M4 17h10",
} as const;

// "/merchant" is only active on its own; other items also match their sub-pages.
const isActive = (path: string, href: string) => (href === "/merchant" || href === "/ca" ? path === href : path === href || path.startsWith(href + "/"));

/** Top navigation links (desktop). */
export function TopNav({ items, hideOnPhone }: { items: NavItem[]; hideOnPhone: boolean }) {
  const path = usePathname();
  return (
    <nav className={`${hideOnPhone ? "hidden sm:flex" : "flex"} flex-wrap gap-4 text-sm`}>
      {items.map((n) => (
        <Link key={n.href} href={n.href}
          className={isActive(path, n.href) ? "font-semibold text-blue-700" : "text-gray-700 hover:text-blue-700"}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** Fixed bottom tab bar shown on phones only. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main">
      {items.map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-blue-700" : "text-gray-500"}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICONS[n.icon ?? "home"]} />
            </svg>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
