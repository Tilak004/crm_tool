import "server-only";
import { actorOf, audit } from "./audit";
import { db } from "./db";

export type RemarkView = {
  id: string; text: string; authorName: string; createdAt: Date; seenAt: Date | null;
  saleDate: string | null;
};

const include = { saleDay: { select: { date: true } } } as const;
const toView = (r: { id: string; text: string; authorName: string; createdAt: Date; seenAt: Date | null; saleDay: { date: string } | null }): RemarkView =>
  ({ id: r.id, text: r.text, authorName: r.authorName, createdAt: r.createdAt, seenAt: r.seenAt, saleDate: r.saleDay?.date ?? null });

export async function remarksForDay(saleDayId: string) {
  return (await db.remark.findMany({ where: { saleDayId }, include, orderBy: { createdAt: "asc" } })).map(toView);
}

export async function remarksForMerchant(merchantId: string, take = 50) {
  return (await db.remark.findMany({ where: { merchantId }, include, orderBy: { createdAt: "desc" }, take })).map(toView);
}

/**
 * Records that the merchant has been shown these remarks (first time only).
 * Called when a merchant page that lists them is rendered.
 */
export async function markRemarksSeen(
  user: { id: string; name: string; role: string },
  merchant: { id: string; businessName: string },
  remarks: RemarkView[],
) {
  const unseen = remarks.filter((r) => !r.seenAt);
  if (unseen.length === 0) return remarks;
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const r of unseen) {
      const { count } = await tx.remark.updateMany({ where: { id: r.id, seenAt: null }, data: { seenAt: now } });
      if (count === 0) continue; // another request got there first
      await audit(tx, {
        actor: actorOf(user), action: "REMARK_SEEN", merchant, saleDate: r.saleDate,
        summary: `Seen: "${truncate(r.text, 120)}" (from ${r.authorName})`, details: { remarkId: r.id },
      });
    }
  });
  // Keep "New" on screen for this view; the CA side now shows the seen time.
  return remarks.map((r) => ({ ...r, isNew: !r.seenAt }));
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
