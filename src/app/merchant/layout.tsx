import AppShell from "@/components/AppShell";
import { requireMerchant } from "@/lib/auth";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { user, merchant } = await requireMerchant();
  return (
    <AppShell
      title={merchant.businessName}
      subtitle={merchant.gstin ? `GSTIN ${merchant.gstin}` : undefined}
      nav={[
        { href: "/merchant", label: "Daily sales" },
        { href: "/merchant/attendance", label: "Attendance" },
        { href: "/merchant/employees", label: "Employees" },
        ...(merchant.canMapHsn ? [{ href: "/merchant/hsn", label: "HSN codes" }] : []),
        { href: "/merchant/activity", label: "My activity" },
      ]}
      userName={user.name}
    >
      {children}
    </AppShell>
  );
}
