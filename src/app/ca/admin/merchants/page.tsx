import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import BusinessBadges, { BusinessTypeFilter, businessTypeWhere } from "@/components/BusinessBadges";
import BusinessFields from "@/components/BusinessFields";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMerchant, resetPassword, setMerchantActive, setMerchantHsnAccess } from "../../actions";

export default async function AdminMerchants({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireAdmin();
  const { type = "" } = await searchParams;
  const merchants = await db.merchant.findMany({
    where: businessTypeWhere(type),
    orderBy: { businessName: "asc" },
    include: { users: { where: { role: "MERCHANT" } } },
  });

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h1 className="mb-4 text-lg font-semibold">Add merchant</h1>
        <ActionForm action={createMerchant} submitLabel="Create merchant" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="businessName" label="Business name *" required />
            <Field name="gstin" label="GSTIN" placeholder="Optional" maxLength={15} />
            <Field name="phone" label="Phone" placeholder="Optional" />
            <Field name="contactName" label="Contact person *" required />
            <Field name="username" label="Login username *" required autoComplete="off" />
            <Field name="password" label="Initial password * (min 8)" required type="password" autoComplete="new-password" />
            <BusinessFields idPrefix="new-" />
          </div>
        </ActionForm>
      </section>

      <BusinessTypeFilter value={type} />

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Business</th><th>GSTIN</th><th>Type</th><th>Login</th><th>Status</th>
              <th title="Lets the merchant search HSN codes and map their own items">Merchant can map HSN</th>
              <th>Reset password</th><th></th>
            </tr>
          </thead>
          <tbody>
            {merchants.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">{type ? "No merchants of this type." : "No merchants yet."}</td></tr>
            )}
            {merchants.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/ca/merchants/${m.id}`} className="font-medium hover:underline">{m.businessName}</Link></td>
                <td className="font-mono text-xs">
                  {m.gstin ?? <span className="font-sans text-amber-700">Not added</span>}{" "}
                  <Link href={`/ca/merchants/${m.id}#edit`} className="font-sans text-blue-700 hover:underline">Edit</Link>
                </td>
                <td><BusinessBadges businessTypes={m.businessTypes} gstRegType={m.gstRegType} /></td>
                <td>{m.users.map((u) => <div key={u.id}>{u.name} <span className="text-gray-500">({u.username})</span></div>)}</td>
                <td>
                  {m.active
                    ? <span className="badge bg-green-100 text-green-800">Active</span>
                    : <span className="badge bg-red-100 text-red-700">Inactive</span>}
                </td>
                <td>
                  <form action={setMerchantHsnAccess.bind(null, m.id, !m.canMapHsn)} className="flex items-center gap-2">
                    <span className={`badge ${m.canMapHsn ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {m.canMapHsn ? "Enabled" : "Off"}
                    </span>
                    <button className="btn btn-secondary py-1 text-xs">{m.canMapHsn ? "Disable" : "Enable"}</button>
                  </form>
                </td>
                <td>
                  {m.users[0] && (
                    <ActionForm action={resetPassword.bind(null, m.users[0].id)} submitLabel="Set" className="flex items-center gap-2">
                      <input className="input w-36 py-1" name="password" type="password" placeholder="New password" required minLength={8} autoComplete="new-password" />
                    </ActionForm>
                  )}
                </td>
                <td className="text-right">
                  <form action={setMerchantActive.bind(null, m.id, !m.active)}>
                    <button className={`btn py-1 text-xs ${m.active ? "btn-danger" : "btn-secondary"}`}>
                      {m.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} {...rest} />
    </div>
  );
}
