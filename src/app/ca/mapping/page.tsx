import Link from "next/link";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import MapItemForm from "@/components/MapItemForm";
import { mapItem } from "../actions";

export default async function MappingPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; show?: string; q?: string; item?: string }>;
}) {
  await requireCA();
  const { merchant: merchantId = "", show = "unmapped", q = "", item: itemId = "" } = await searchParams;
  const showAll = show === "all";

  const [merchants, items] = await Promise.all([
    db.merchant.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    db.item.findMany({
      // ?item= opens one specific item (the "Change" link on a day view), whatever the other filters say.
      where: itemId ? { id: itemId } : {
        merchant: { active: true },
        ...(merchantId ? { merchantId } : {}),
        ...(show === "mapped" ? { hsnCode: { not: null } } : showAll ? {} : { hsnCode: null }),
        ...(q.trim() ? { nameKey: { contains: q.trim().toLowerCase() } } : {}),
      },
      include: {
        merchant: { select: { businessName: true } },
        mappedBy: { select: { name: true, role: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 300,
    }),
  ]);

  // Hint: how items with the same name were mapped for other merchants.
  const keys = [...new Set(items.map((i) => i.nameKey))];
  const peers = keys.length
    ? await db.item.findMany({
        where: { nameKey: { in: keys }, hsnCode: { not: null } },
        select: { nameKey: true, merchantId: true, hsnCode: true, gstRate: true },
      })
    : [];

  // Official descriptions for codes already on screen, and whether the HSN list is loaded.
  const shownCodes = [...new Set([...items.map((i) => i.hsnCode), ...peers.map((p) => p.hsnCode)].filter((c): c is string => !!c))];
  const [descriptions, masterCount] = await Promise.all([
    db.hsnCode.findMany({ where: { code: { in: shownCodes } }, select: { code: true, description: true } }),
    db.hsnCode.count(),
  ]);
  const descByCode = new Map(descriptions.map((d) => [d.code, d.description]));
  const masterLoaded = masterCount > 0;

  return (
    <div className="space-y-4">
      {!masterLoaded && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The official HSN list hasn&apos;t been loaded yet, so codes can&apos;t be searched or verified.{" "}
          <Link href="/ca/hsn" className="font-medium underline">Load it from the GST portal</Link>
        </p>
      )}
      <div>
        <h1 className="text-lg font-semibold">HSN mapping</h1>
        <p className="text-sm text-gray-500">
          Each merchant&apos;s items are mapped once. Future sales of the same item use this mapping automatically.
          To correct a mapping, choose <b>Already mapped</b>, change the code or rate and click <b>Update</b>. The change is recorded in the edit log.
        </p>
      </div>

      {itemId && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Showing one item. <Link href="/ca/mapping?show=mapped" className="font-medium underline">Show all mapped items</Link>
        </p>
      )}

      {/* key re-syncs the uncontrolled fields with the URL after navigation */}
      <form key={`${merchantId}|${show}|${q}`} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="merchant">Merchant</label>
          <AutoSubmitSelect className="input" id="merchant" name="merchant" defaultValue={merchantId}>
            <option value="">All merchants</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.businessName}</option>)}
          </AutoSubmitSelect>
        </div>
        <div>
          <label className="label" htmlFor="show">Show</label>
          <AutoSubmitSelect className="input" id="show" name="show" defaultValue={show}>
            <option value="unmapped">Unmapped only</option>
            <option value="mapped">Already mapped</option>
            <option value="all">All items</option>
          </AutoSubmitSelect>
        </div>
        <div className="grow">
          <label className="label" htmlFor="q">Search item</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="Item name, then press Enter" />
        </div>
        <button className="btn btn-secondary">Search</button>
      </form>

      {/* No overflow clipping here: the HSN suggestion list must be able to extend past the table. */}
      <div className="card pb-2">
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Merchant</th>
              <th>Unit</th>
              <th className="text-right">Times sold</th>
              <th>HSN code &amp; GST rate</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  {show === "unmapped" && !itemId ? "All items are mapped. 🎉" : "No items found."}
                </td>
              </tr>
            )}
            {items.map((item) => {
              const hint = peers.find((p) => p.nameKey === item.nameKey && p.merchantId !== item.merchantId);
              return (
                <tr key={item.id}>
                  <td>
                    <div className="font-medium">{item.name}</div>
                    {item.mappedBy && (
                      <div className="text-xs text-gray-400">
                        Mapped by {item.mappedBy.name}
                        {item.mappedAt && ` on ${item.mappedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`}
                        {item.mappedBy.role === "MERCHANT" && <span className="badge ml-1 bg-purple-100 text-purple-800">merchant</span>}
                      </div>
                    )}
                    {!item.hsnCode && hint && (
                      <div className="text-xs text-blue-700">
                        Same name elsewhere: HSN {hint.hsnCode} @ {hint.gstRate}%
                      </div>
                    )}
                  </td>
                  <td>
                    <Link href={`/ca/merchants/${item.merchantId}`} className="hover:underline">{item.merchant.businessName}</Link>
                  </td>
                  <td>{item.unit}</td>
                  <td className="text-right">{item._count.lines}</td>
                  <td>
                    <MapItemForm
                      save={mapItem.bind(null, item.id)}
                      hsn={item.hsnCode ?? hint?.hsnCode ?? ""}
                      hsnDescription={descByCode.get(item.hsnCode ?? hint?.hsnCode ?? "") ?? null}
                      rate={item.gstRate ?? hint?.gstRate ?? null}
                      mapped={!!item.hsnCode}
                      masterLoaded={masterLoaded}
                      merchantId={item.merchantId}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items.length === 300 && <p className="text-xs text-gray-500">Showing first 300 items. Use filters to narrow down.</p>}
    </div>
  );
}
