import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/uploads";

// Serves an invoice file to the merchant who owns it or to CA users.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const a = await db.dayAttachment.findUnique({ where: { id }, include: { saleDay: { select: { merchantId: true } } } });
  const allowed = a && (user.role !== "MERCHANT" || user.merchantId === a.saleDay.merchantId);
  if (!a || !allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Buffer;
  try {
    body = await readUpload(a.storageKey);
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
