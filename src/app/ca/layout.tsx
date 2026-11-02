import AppShell from "@/components/AppShell";
import { requireCA } from "@/lib/auth";

export default async function CALayout({ children }: { children: React.ReactNode }) {
  const user = await requireCA();
  const nav = [
    { href: "/ca", label: "Dashboard" },
    { href: "/ca/mapping", label: "HSN mapping" },
    { href: "/ca/hsn", label: "HSN codes" },
    { href: "/ca/audit", label: "Edit log" },
  ];
  if (user.role === "ADMIN") {
    nav.push({ href: "/ca/admin/merchants", label: "Merchants" }, { href: "/ca/admin/staff", label: "Staff" });
  }
  return (
    <AppShell title="CA Workspace" subtitle={user.role === "ADMIN" ? "Admin" : "Staff"} nav={nav} userName={user.name}>
      {children}
    </AppShell>
  );
}
