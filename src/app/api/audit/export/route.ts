import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit";
import { auditChanges, auditWhere, findAuditEntries } from "@/lib/audit-query";
import { currentUser } from "@/lib/auth";

// CSV of the edit log. CA users can export everything; a merchant only their own entries.
// Includes each entry's hash and previous hash so the chain can be checked offline.
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const filters = { merchant: p.get("merchant") ?? "", who: p.get("who") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "" };
  const scope = user.role === "MERCHANT" ? user.merchantId! : undefined;
  const entries = (await findAuditEntries(auditWhere(filters, scope))).reverse();

  const header = ["seq", "time_utc", "actor", "role", "merchant", "sales_date", "action", "summary", "changes", "prev_hash", "hash"];
  const rows = entries.map((e) => [
    e.seq, e.createdAt.toISOString(), e.actorName, e.actorRole, e.merchantName ?? "", e.saleDate ?? "",
    AUDIT_ACTIONS[e.action as AuditAction] ?? e.action, e.summary, auditChanges(e.details).join(" | "), e.prevHash, e.hash,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edit-log-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvCell(v: unknown) {
  let s = String(v ?? "");
  // Stop spreadsheet apps from treating cell text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
