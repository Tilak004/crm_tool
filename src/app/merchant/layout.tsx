import AppShell from "@/components/AppShell";
import type { NavItem } from "@/components/NavLinks";
import { requireMerchant } from "@/lib/auth";
import { todayIST } from "@/lib/gst";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { user, merchant } = await requireMerchant();
  const hsn: NavItem[] = merchant.canMapHsn ? [{ href: "/merchant/hsn", label: "HSN", icon: "hsn" }] : [];
  return (
    <AppShell
      title={merchant.businessName}
      subtitle={merchant.gstin ? `GSTIN ${merchant.gstin}` : undefined}
      nav={[
        { href: "/merchant", label: "Home" },
        { href: "/merchant/attendance", label: "Attendance" },
        { href: "/merchant/employees", label: "Employees" },
        ...(merchant.canMapHsn ? [{ href: "/merchant/hsn", label: "HSN codes" }] : []),
        { href: "/merchant/activity", label: "My activity" },
      ]}
      phoneTabs={[
        { href: "/merchant", label: "Home", icon: "home" },
        { href: `/merchant/day/${todayIST()}`, label: "Today's sales", icon: "sales" },
        { href: "/merchant/attendance", label: "Attendance", icon: "calendar" },
        { href: "/merchant/employees", label: "Staff", icon: "users" },
        ...hsn,
        { href: "/merchant/activity", label: "Activity", icon: "activity" },
      ]}
      userName={user.name}
    >
      {children}
    </AppShell>
  );
}
