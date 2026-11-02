import { redirect } from "next/navigation";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import MapItemForm from "@/components/MapItemForm";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { mapOwnItem } from "../actions";

export default async function MerchantHsnPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { merchant } = await requireMerchant();
  if (!merchant.canMapHsn) redirect("/merchant");
  const { show = "unmapped" } = await searchParams;
  const showAll = show === "all";

  const [items, masterCount] = await Promise.all([
    db.item.findMany({
      where: { merchantId: merchant.id, ...(showAll ? {} : { hsnCode: null }) },
      include: { mappedBy: { select: { name: true, role: true } } },
      orderBy: { name: "asc" },
    }),
    db.hsnCode.count(),
  ]);
  const codes = [...new Set(items.map((i) => i.hsnCode).filter((c): c is string => !!c))];
  const descByCode = new Map(
    (await db.hsnCode.findMany({ where: { code: { in: codes } }, select: { code: true, description: true } }))
      .map((d) => [d.code, d.description]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">HSN codes for my items</h1>
          <p className="text-sm text-gray-500">
            Search the official HSN list by code or description and pick the GST rate. Your CA can review and change these.
          </p>
        </div>
        <form key={show}>
          <label className="label" htmlFor="show">Show</label>
          <AutoSubmitSelect className="input" id="show" name="show" defaultValue={show}>
            <option value="unmapped">Items without HSN</option>
            <option value="all">All my items</option>
          </AutoSubmitSelect>
        </form>
      </div>

      {/* No overflow clipping: the HSN suggestion list must be able to extend past the table. */}
      <div className="card pb-2">
        <table className="table">
          <thead><tr><th>Item</th><th>Unit</th><th>HSN code &amp; GST rate</th></tr></thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={3} className="py-8 text-center text-gray-500">{showAll ? "No items yet." : "All your items have an HSN code."}</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="font-medium">{item.name}</div>
                  {item.mappedBy && (
                    <div className="text-xs text-gray-400">
                      Set by {item.mappedBy.role === "MERCHANT" ? "you" : "your CA"}
                    </div>
                  )}
                </td>
                <td>{item.unit}</td>
                <td>
                  <MapItemForm
                    save={mapOwnItem.bind(null, item.id)}
                    hsn={item.hsnCode ?? ""}
                    hsnDescription={item.hsnCode ? descByCode.get(item.hsnCode) ?? null : null}
                    rate={item.gstRate}
                    mapped={!!item.hsnCode}
                    masterLoaded={masterCount > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
