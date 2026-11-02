import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHsn } from "@/lib/hsn";

export default async function HsnCodeDetail({ params }: { params: Promise<{ code: string }> }) {
  await requireCA();
  const { code } = await params;
  if (!/^\d{2,8}$/.test(code)) notFound();

  const [hsn, children, items] = await Promise.all([
    getHsn(code),
    db.hsnCode.findMany({ where: { code: { startsWith: code, not: code } }, orderBy: { code: "asc" }, take: 200 }),
    db.item.findMany({
      where: { hsnCode: code },
      include: { merchant: { select: { businessName: true } }, mappedBy: { select: { name: true } } },
      orderBy: [{ merchant: { businessName: "asc" } }, { name: "asc" }],
    }),
  ]);
  if (!hsn && items.length === 0) notFound();

  return (
    <div className="space-y-4">
      <Link href="/ca/hsn" className="text-sm text-blue-700 hover:underline">&larr; HSN codes</Link>

      <div className="card p-4">
        {hsn?.parents.map((p) => (
          <div key={p.code} className="text-xs text-gray-500">
            <Link href={`/ca/hsn/${p.code}`} className="font-mono hover:underline">{p.code}</Link> {p.description}
          </div>
        ))}
        <h1 className="mt-2 text-lg font-semibold">
          <span className="font-mono">{code}</span>
          {hsn?.kind === "SERVICE" && <span className="badge ml-2 bg-purple-100 text-purple-800">SAC</span>}
        </h1>
        <p className="text-sm">
          {hsn?.description ?? <span className="text-amber-700">Not in the official HSN list. Please review the items below.</span>}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">Items mapped to {code}</div>
        <table className="table">
          <thead><tr><th>Item</th><th>Merchant</th><th className="text-right">Rate</th><th>Mapped by</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">No items mapped to this code.</td></tr>
            )}
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.merchant.businessName}</td>
                <td className="text-right">{i.gstRate}%</td>
                <td className="text-sm text-gray-500">
                  {i.mappedBy?.name ?? "—"}
                  {i.mappedAt && `, ${i.mappedAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`}
                </td>
                <td className="text-right">
                  <Link href={`/ca/mapping?item=${i.id}`}
                    className="text-blue-700 hover:underline">Change</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {children.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">More specific codes under {code}</div>
          <table className="table">
            <tbody>
              {children.map((c) => (
                <tr key={c.code}>
                  <td className="w-28 font-mono">
                    <Link href={`/ca/hsn/${c.code}`} className="text-blue-700 hover:underline">{c.code}</Link>
                  </td>
                  <td>{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
