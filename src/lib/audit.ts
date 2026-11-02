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
  MERCHANT_DELETED: "Merchant deleted",
  MERCHANT_EXPORTED: "Merchant data downloaded",
  HSN_ACCESS: "Merchant HSN access changed",
  USER_CREATED: "CA user created",
  USER_STATUS: "User activated/deactivated",
  PASSWORD_RESET: "Password reset",
  TWO_FACTOR_ENROLLED: "Authenticator set up",
  TWO_FACTOR_RESET: "Authenticator reset",
  HSN_IMPORTED: "HSN list imported",
  EMPLOYEE_ADDED: "Employee added",
  EMPLOYEE_UPDATED: "Employee details changed",
  EMPLOYEE_LEFT: "Employee left",
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

export type ChainCheck =
  | { ok: true; count: number; checkedNow: number; full: boolean }
  | { ok: false; count: number; checkedNow: number; full: boolean; brokenAtSeq: number; reason: string };

/**
 * Checks the chain. Normally it starts from the last verified entry (the
 * checkpoint) and reads only entries added since, so the Edit log page stays
 * fast however long the log gets. Rewriting history before the checkpoint
 * would change the checkpoint entry's hash, which is checked first.
 *
 * A full check ({ full: true }) re-reads every entry from the first one; it
 * also catches a single edited entry hidden before the checkpoint. It runs
 * nightly (deploy/verify-audit.sh) and from the Edit log page on request.
 */
export async function verifyAuditChain({ full = false } = {}): Promise<ChainCheck> {
  let start = { seq: 0, hash: GENESIS, count: 0 };
  if (!full) {
    const cp = await db.auditCheckpoint.findUnique({ where: { kind: "latest" } });
    if (cp?.ok && cp.seq > 0) {
      const row = await db.auditLog.findUnique({ where: { seq: cp.seq } });
      if (!row || row.hash !== cp.hash || hashEntry(row) !== cp.hash) {
        return saveCheck({
          ok: false, full, count: cp.count, checkedNow: 0, brokenAtSeq: cp.seq,
          reason: "an entry that was already verified has been changed or removed",
        }, start);
      }
      start = { seq: cp.seq, hash: cp.hash, count: cp.count };
    }
  }

  let prevHash = start.hash;
  let lastSeq = start.seq;
  let checkedNow = 0;
  for (;;) {
    const batch = await db.auditLog.findMany({ where: { seq: { gt: lastSeq } }, orderBy: { seq: "asc" }, take: 1000 });
    if (batch.length === 0) break;
    for (const e of batch) {
      const fail = (reason: string) => saveCheck({
        ok: false, full, count: start.count + checkedNow, checkedNow, brokenAtSeq: e.seq, reason,
      }, start);
      if (e.prevHash !== prevHash) return fail("an earlier entry was removed or changed");
      if (hashEntry(e) !== e.hash) return fail("this entry's contents were changed");
      prevHash = e.hash;
      lastSeq = e.seq;
      checkedNow++;
    }
  }
  return saveCheck({ ok: true, full, count: start.count + checkedNow, checkedNow }, { seq: lastSeq, hash: prevHash, count: start.count + checkedNow });
}

async function saveCheck(result: ChainCheck, reached: { seq: number; hash: string; count: number }) {
  const data = {
    seq: reached.seq, hash: reached.hash, count: reached.count, ok: result.ok, checkedAt: new Date(),
    brokenAtSeq: result.ok ? null : result.brokenAtSeq, reason: result.ok ? null : result.reason,
  };
  const kinds = result.full ? ["latest", "full"] : ["latest"];
  for (const kind of kinds) {
    // A failed quick check keeps the old checkpoint's position, so the next check starts over from the beginning.
    if (!result.ok && kind === "latest") {
      await db.auditCheckpoint.upsert({ where: { kind }, create: { kind, ...data, seq: 0, hash: GENESIS, count: 0 }, update: { ok: false, brokenAtSeq: data.brokenAtSeq, reason: data.reason, checkedAt: data.checkedAt } });
      continue;
    }
    await db.auditCheckpoint.upsert({ where: { kind }, create: { kind, ...data }, update: data });
  }
  return result;
}

/** When the whole log was last re-read, and the outcome. */
export function lastFullCheck() {
  return db.auditCheckpoint.findUnique({ where: { kind: "full" } });
}

export const actorOf = (u: { id: string; name: string; role: string }): Actor => ({ id: u.id, name: u.name, role: u.role });
