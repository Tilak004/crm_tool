import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { searchHsn } from "@/lib/hsn";
import { importHsnFromPortal, importHsnFromUpload } from "../actions";

export default async function HsnCodesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCA();
  const { q = "" } = await searchParams;

  const [goods, services, lastImport] = await Promise.all([
    db.hsnCode.count({ where: { kind: "GOODS" } }),
    db.hsnCode.count({ where: { kind: "SERVICE" } }),
    db.hsnImport.findFirst({ orderBy: { importedAt: "desc" } }),
  ]);
  const loaded = goods + services > 0;
  const results = q.trim() ? await searchHsn(q, { limit: 100, includeChapters: true }) : [];

  // Without a search, show the codes the firm has already used.
  const used = q.trim()
    ? []
    : await db.item.groupBy({ by: ["hsnCode"], where: { hsnCode: { not: null } }, _count: { _all: true }, orderBy: { hsnCode: "asc" } });
  const usedDescriptions = new Map(
    (await db.hsnCode.findMany({ where: { code: { in: used.map((u) => u.hsnCode!) } } })).map((h) => [h.code, h.description]),
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start gap-4 p-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">HSN codes</h1>
          {loaded ? (
            <p className="text-sm text-gray-500">
              Official GST portal list: {goods.toLocaleString("en-IN")} HSN (goods) and {services.toLocaleString("en-IN")} SAC (services) codes.
              {lastImport && (
                <> Updated {lastImport.importedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                {lastImport.importedBy ? ` by ${lastImport.importedBy}` : ""}.</>
              )}
            </p>
          ) : (
            <p className="text-sm text-amber-700">The official HSN list hasn&apos;t been loaded yet.</p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            The GST portal file has codes and descriptions only, not tax rates. Check rates against CBIC rate notifications.
          </p>
        </div>
        {user.role === "ADMIN" && (
          <div className="space-y-2">
            <ActionForm action={importHsnFromPortal} submitLabel={loaded ? "Update from GST portal" : "Load from GST portal"}>
              {null}
            </ActionForm>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-gray-500">Or upload HSN_SAC.xlsx yourself</summary>
              <ActionForm action={importHsnFromUpload} submitLabel="Upload" className="mt-2 space-y-2">
                <input type="file" name="file" accept=".xlsx" required className="block text-xs" />
              </ActionForm>
            </details>
          </div>
        )}
      </div>

      <form className="card flex items-end gap-3 p-4">
        <div className="grow">
          <label className="label" htmlFor="q">Search by code or description</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="e.g. 1905, biscuit, ceiling fan" autoFocus />
        </div>
        <button className="btn btn-secondary">Search</button>
      </form>

      {q.trim() ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-28">Code</th><th>Description</th><th>Your firm</th></tr></thead>
            <tbody>
              {results.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-gray-500">No codes match &ldquo;{q}&rdquo;.</td></tr>
              )}
              {results.map((r) => (
                <tr key={r.code}>
                  <td className="font-mono">
                    <Link href={`/ca/hsn/${r.code}`} className="text-blue-700 hover:underline">{r.code}</Link>
                    {r.kind === "SERVICE" && <span className="badge ml-1 bg-purple-100 font-sans text-purple-800">SAC</span>}
                  </td>
                  <td>
                    <div className={r.code.length <= 4 ? "font-semibold" : ""}>{r.description}</div>
                    {r.parents.length > 0 && (
                      <div className="text-xs text-gray-400">{r.parents.map((p) => p.description).join(" › ")}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {r.firmItemCount > 0 ? `${r.firmItemCount} item(s) at ${r.firmRate}%` : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 100 && <p className="p-3 text-xs text-gray-500">Showing the first 100 matches. Add more words to narrow down.</p>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">Codes your firm has used</div>
          <table className="table">
            <thead><tr><th className="w-28">Code</th><th>Official description</th><th className="text-right">Items mapped</th></tr></thead>
            <tbody>
              {used.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-gray-500">No items mapped yet.</td></tr>
              )}
              {used.map((u) => (
                <tr key={u.hsnCode}>
                  <td className="font-mono">
                    <Link href={`/ca/hsn/${u.hsnCode}`} className="text-blue-700 hover:underline">{u.hsnCode}</Link>
                  </td>
                  <td>
                    {usedDescriptions.get(u.hsnCode!) ?? (
                      <span className="text-amber-700">{loaded ? "Not in the official list. Please review." : "—"}</span>
                    )}
                  </td>
                  <td className="text-right">{u._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
