import { NextResponse, type NextRequest } from "next/server";
import { actorOf, audit } from "@/lib/audit";
import { currentUser, isCARole } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildInvoiceFilesZip, exportFileName } from "@/lib/merchant-export";

// ZIP of all of one merchant's uploaded invoice files, for CA users. Each download is logged.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !isCARole(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await buildInvoiceFilesZip(id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.$transaction((tx) => audit(tx, {
    actor: actorOf(user), action: "MERCHANT_EXPORTED", merchant: result.merchant,
    summary: `Invoice files downloaded as ZIP (${result.count} file(s))`, details: { files: result.count },
  }));
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFileName(result.merchant.businessName, "invoice-files.zip")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
