import { NextResponse, type NextRequest } from "next/server";
import { actorOf, audit } from "@/lib/audit";
import { currentUser, isCARole } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMerchantWorkbook, exportFileName } from "@/lib/merchant-export";

// Excel workbook with all of one merchant's data, for CA users. Each download is logged.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !isCARole(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await buildMerchantWorkbook(id, user.name);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.$transaction((tx) => audit(tx, {
    actor: actorOf(user), action: "MERCHANT_EXPORTED", merchant: result.merchant,
    summary: `All data downloaded as Excel (${result.counts.salesDays} sales day(s), ${result.counts.employees} employee(s))`,
    details: result.counts,
  }));
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(result.merchant.businessName, "xlsx")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
