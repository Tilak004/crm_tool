import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Every change in the app is recorded here, inside the same transaction as the
// change itself, so a change can't be saved without its log entry.
//
// Tamper evidence: each entry's hash = SHA-256 of its content + the previous
// entry's hash. Editing or deleting any stored row breaks the chain, which
// verifyAuditChain() reports. (SQLite runs write transactions one at a time, so
// the chain is built in order. On PostgreSQL, take a table lock before reading
// the last hash.)

export const AUDIT_ACTIONS = {
  DAY_DRAFT_SAVED: "Draft saved",
  DAY_SUBMITTED: "Submitted to CA",
  CA_EDITED_DAY: "Invoices changed by CA",
  FILE_UPLOADED: "Invoice file uploaded",
  FILE_REMOVED: "Invoice file removed",
  ITEM_MAPPED: "HSN mapped",
  DAY_LOCKED: "Day locked",
  DAY_UNLOCKED: "Day unlocked",
  MERCHANT_CREATED: "Merchant created",
  MERCHANT_UPDATED: "Merchant details changed",
  MERCHANT_STATUS: "Merchant activated/deactivated",
  HSN_ACCESS: "Merchant HSN access changed",
  USER_CREATED: "CA user created",
  USER_STATUS: "User activated/deactivated",
  PASSWORD_RESET: "Password reset",
  TWO_FACTOR_ENROLLED: "Authenticator set up",
  TWO_FACTOR_RESET: "Authenticator reset",
  HSN_IMPORTED: "HSN list imported",
  EMPLOYEE_ADDED: "Employee added",
  EMPLOYEE_UPDATED: "Employee details changed",
  SALARY_CHANGED: "Salary changed",
  ATTENDANCE_MARKED: "Attendance marked",
  REMARK_ADDED: "CA remark added",
  REMARK_SEEN: "Remark seen by merchant",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

export type Actor = { id: string; name: string; role: string };

export type AuditInput = {
  actor: Actor;
  action: AuditAction;
  summary: string;
  merchant?: { id: string; businessName: string } | null;
  saleDate?: string | null;
  details?: unknown;
};

const GENESIS = "0".repeat(64);

type HashFields = {
  createdAt: Date; actorId: string; actorName: string; actorRole: string;
  merchantId: string | null; merchantName: string | null; saleDate: string | null;
  action: string; summary: string; details: string; prevHash: string;
};

function hashEntry(e: HashFields) {
  const canonical = JSON.stringify([
    e.createdAt.toISOString(), e.actorId, e.actorName, e.actorRole, e.merchantId, e.merchantName,
    e.saleDate, e.action, e.summary, e.details, e.prevHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Appends an entry. Pass the transaction client so the entry commits with the change. */
export async function audit(tx: Prisma.TransactionClient, input: AuditInput) {
  const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const fields: HashFields = {
    createdAt: new Date(),
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    merchantId: input.merchant?.id ?? null,
    merchantName: input.merchant?.businessName ?? null,
    saleDate: input.saleDate ?? null,
    action: input.action,
    summary: input.summary,
    details: JSON.stringify(input.details ?? {}),
    prevHash: last?.hash ?? GENESIS,
  };
  await tx.auditLog.create({ data: { ...fields, hash: hashEntry(fields) } });
}

/** Recomputes the whole chain. Returns the first broken entry, if any. */
export async function verifyAuditChain(): Promise<{ ok: true; count: number } | { ok: false; count: number; brokenAtSeq: number; reason: string }> {
  let prevHash = GENESIS;
  let count = 0;
  let cursor: number | undefined;
  for (;;) {
    const batch = await db.auditLog.findMany({
      orderBy: { seq: "asc" }, take: 1000, ...(cursor ? { skip: 1, cursor: { seq: cursor } } : {}),
    });
    if (batch.length === 0) break;
    for (const e of batch) {
      if (e.prevHash !== prevHash) return { ok: false, count, brokenAtSeq: e.seq, reason: "an earlier entry was removed or changed" };
      if (hashEntry(e) !== e.hash) return { ok: false, count, brokenAtSeq: e.seq, reason: "this entry's contents were changed" };
      prevHash = e.hash;
      count++;
    }
    cursor = batch[batch.length - 1].seq;
  }
  return { ok: true, count };
}

export const actorOf = (u: { id: string; name: string; role: string }): Actor => ({ id: u.id, name: u.name, role: u.role });
