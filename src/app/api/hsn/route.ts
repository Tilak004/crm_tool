import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { hsnPrefixesFor, parseBusinessTypes } from "@/lib/business";
import { db } from "@/lib/db";
import { searchHsn } from "@/lib/hsn";

// Used by the HSN picker. CA users see firm-wide usage; merchants the admin has
// allowed to map HSN codes see usage from their own items only. Codes that fit
// the merchant's business types (?merchant=<id> for CA users) are listed first.
export async function GET(req: NextRequest) {
  const user = await currentUser();
  const isCA = user?.role === "ADMIN" || user?.role === "STAFF";
  const isAllowedMerchant = user?.role === "MERCHANT" && !!user.merchant?.canMapHsn;
  if (!user || (!isCA && !isAllowedMerchant)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);

  const merchantId = isCA ? req.nextUrl.searchParams.get("merchant") : user.merchantId;
  const merchant = merchantId
    ? await db.merchant.findUnique({ where: { id: merchantId }, select: { businessTypes: true } })
    : null;

  const results = await searchHsn(q, {
    usageMerchantId: isCA ? undefined : user.merchantId!,
    preferPrefixes: merchant ? hsnPrefixesFor(parseBusinessTypes(merchant.businessTypes)) : [],
  });
  return NextResponse.json({ results });
}
