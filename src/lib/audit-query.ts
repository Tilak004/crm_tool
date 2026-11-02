import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type AuditFilters = { merchant?: string; who?: string; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Filter dates are calendar days in India.
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istEnd = (d: string) => new Date(`${d}T23:59:59.999+05:30`);

/** Builds the query for the edit log. `scopeMerchantId` restricts a merchant to their own entries. */
export function auditWhere(f: AuditFilters, scopeMerchantId?: string): Prisma.AuditLogWhereInput {
  const merchantId = scopeMerchantId ?? (f.merchant || undefined);
  return {
    ...(merchantId ? { merchantId } : {}),
    ...(f.who === "merchant" ? { actorRole: "MERCHANT" } : f.who === "ca" ? { actorRole: { in: ["ADMIN", "STAFF"] } } : {}),
    ...(f.from && DATE_RE.test(f.from) || f.to && DATE_RE.test(f.to)
      ? {
          createdAt: {
            ...(f.from && DATE_RE.test(f.from) ? { gte: istStart(f.from) } : {}),
            ...(f.to && DATE_RE.test(f.to) ? { lte: istEnd(f.to) } : {}),
          },
        }
      : {}),
  };
}

export function findAuditEntries(where: Prisma.AuditLogWhereInput, take?: number) {
  return db.auditLog.findMany({ where, orderBy: { seq: "desc" }, ...(take ? { take } : {}) });
}

/** The change list stored with day saves, if any. */
export function auditChanges(details: string): string[] {
  try {
    const d = JSON.parse(details);
    return Array.isArray(d?.changes) ? d.changes.filter((c: unknown) => typeof c === "string") : [];
  } catch {
    return [];
  }
}
