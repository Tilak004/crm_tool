import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { AUDIT_ACTIONS, type AuditAction } from "./audit";
import { auditChanges } from "./audit-query";
import { businessLabel, gstRegLabel, parseBusinessTypes } from "./business";
import { db } from "./db";
import { splitInclusive, todayIST } from "./gst";
import { PAYMENT_MODES, modeLabel } from "./payments";
import { attendanceLabel, monthDates, salaryForMonth, shiftMonth, summarizeMonth } from "./payroll";
import { readUpload } from "./uploads";

// Everything stored about one merchant, as an Excel workbook (one sheet per
// kind of record) and a ZIP of their uploaded invoice files. Used by the CA
// before deleting a merchant, or any time as an offline copy.

const RUPEES = "#,##0.00";
const rs = (paise: number | null | undefined) => (paise == null ? null : paise / 100);
const ist = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "";

type Col = { header: string; key: string; width?: number; money?: boolean };

function addSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
  for (const c of cols) if (c.money) ws.getColumn(c.key).numFmt = RUPEES;
  ws.getRow(1).font = { bold: true };
  ws.addRows(rows);
  if (rows.length === 0) ws.addRow({ [cols[0].key]: "(none)" });
  else ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export function exportFileName(businessName: string, ext: string) {
  const safe = businessName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "merchant";
  return `${safe}-${todayIST()}.${ext}`;
}

export async function buildMerchantWorkbook(merchantId: string, exportedBy: string) {
  const merchant = await db.merchant.findUnique({ where: { id: merchantId }, include: { users: true } });
  if (!merchant) return null;
  const [days, items, employees, remarks, log] = await Promise.all([
    db.saleDay.findMany({
      where: { merchantId },
      orderBy: { date: "asc" },
      include: {
        invoices: { orderBy: { position: "asc" }, include: { lines: { orderBy: { position: "asc" }, include: { item: true } } } },
        lines: { include: { item: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        lockedBy: { select: { name: true } },
      },
    }),
    db.item.findMany({ where: { merchantId }, orderBy: { name: "asc" }, include: { mappedBy: { select: { name: true } } } }),
    db.employee.findMany({
      where: { merchantId },
      orderBy: { name: "asc" },
      include: { salaries: { orderBy: { effectiveMonth: "asc" } }, attendance: { orderBy: { date: "asc" } } },
    }),
    db.remark.findMany({ where: { merchantId }, orderBy: { createdAt: "asc" }, include: { saleDay: { select: { date: true } } } }),
    db.auditLog.findMany({ where: { merchantId }, orderBy: { seq: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "PakkaLekka";
  wb.created = new Date();

  // 1. Merchant
  const info: [string, string][] = [
    ["Business name", merchant.businessName],
    ["GSTIN", merchant.gstin ?? ""],
    ["State", merchant.state ?? ""],
    ["Phone", merchant.phone ?? ""],
    ["GST registration", gstRegLabel(merchant.gstRegType) ?? ""],
    ["Business types", parseBusinessTypes(merchant.businessTypes).map(businessLabel).join(", ")],
    ["Status", merchant.active ? "Active" : "Inactive"],
    ["Merchant can map HSN", merchant.canMapHsn ? "Yes" : "No"],
    ["Created", ist(merchant.createdAt)],
    ["Logins", merchant.users.map((u) => `${u.name} (${u.username})${u.active ? "" : " – inactive"}`).join(", ")],
    ["Exported", `${ist(new Date())} by ${exportedBy}`],
  ];
  const ws = addSheet(wb, "Merchant", [{ header: "Field", key: "k", width: 24 }, { header: "Value", key: "v", width: 70 }],
    info.map(([k, v]) => ({ k, v })));
  ws.autoFilter = undefined;

  // 2. Monthly summary: what the CA needs for the monthly return
  type MonthTotals = {
    month: string; days: number; invoices: number; total: number; taxable: number; tax: number; unmapped: number;
    byMode: Record<string, number>;
  };
  const months = new Map<string, MonthTotals>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    let m = months.get(key);
    if (!m) {
      m = { month: key, days: 0, invoices: 0, total: 0, taxable: 0, tax: 0, unmapped: 0, byMode: Object.fromEntries(PAYMENT_MODES.map((p) => [p.key, 0])) };
      months.set(key, m);
    }
    m.days++;
    m.invoices += d.invoices.length;
    for (const inv of d.invoices) for (const l of inv.lines) {
      m.byMode[inv.mode] = (m.byMode[inv.mode] ?? 0) + l.amountPaise;
      m.total += l.amountPaise;
    }
    for (const l of d.lines) {
      if (l.item.gstRate == null) { m.unmapped += l.amountPaise; continue; }
      const split = splitInclusive(l.amountPaise, l.item.gstRate);
      m.taxable += split.taxable;
      m.tax += split.tax;
    }
  }
  addSheet(wb, "Monthly summary", [
    { header: "Month", key: "month", width: 10 }, { header: "Days with sales", key: "days", width: 15 },
    { header: "Invoices", key: "invoices" },
    ...PAYMENT_MODES.map((m) => ({ header: m.label, key: m.key, money: true })),
    { header: "Bank total (UPI + card + other)", key: "bank", money: true, width: 18 },
    { header: "Total incl. GST", key: "total", money: true, width: 16 },
    { header: "Taxable value (mapped items)", key: "taxable", money: true, width: 18 },
    { header: "GST (mapped items)", key: "tax", money: true, width: 16 },
    { header: "Sales of items without HSN/rate", key: "unmapped", money: true, width: 18 },
  ], [...months.values()].map((m) => ({
    month: m.month, days: m.days, invoices: m.invoices,
    ...Object.fromEntries(Object.entries(m.byMode).map(([k, v]) => [k, rs(v)])),
    bank: rs(PAYMENT_MODES.filter((p) => p.bank).reduce((n, p) => n + (m.byMode[p.key] ?? 0), 0)),
    total: rs(m.total), taxable: rs(m.taxable), tax: rs(m.tax), unmapped: rs(m.unmapped),
  })));

  // 3. Day summary: one row per sales day, totals per payment mode (the detail behind the monthly figures)
  addSheet(wb, "Day summary", [
    { header: "Date", key: "date" }, { header: "Status", key: "status", width: 14 },
    { header: "Invoices", key: "invoices" },
    ...PAYMENT_MODES.map((m) => ({ header: m.label, key: m.key, money: true })),
    { header: "Total", key: "total", money: true }, { header: "Locked by", key: "lockedBy", width: 18 },
  ], days.map((d) => {
    const byMode: Record<string, number> = Object.fromEntries(PAYMENT_MODES.map((m) => [m.key, 0]));
    for (const inv of d.invoices) for (const l of inv.lines) byMode[inv.mode] = (byMode[inv.mode] ?? 0) + l.amountPaise;
    const total = Object.values(byMode).reduce((a, b) => a + b, 0);
    return {
      date: d.date, status: d.locked ? "Locked" : d.submitted ? "Submitted" : "Draft",
      invoices: d.invoices.length, ...Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, rs(v)])),
      total: rs(total), lockedBy: d.lockedBy?.name ?? "",
    };
  }));

  // 3. Invoices: one row per item line
  addSheet(wb, "Invoices", [
    { header: "Date", key: "date" }, { header: "Invoice no", key: "no" }, { header: "Payment mode", key: "mode", width: 14 },
    { header: "Item", key: "item", width: 30 }, { header: "Qty", key: "qty", width: 8 }, { header: "Unit", key: "unit", width: 8 },
    { header: "Amount incl. GST", key: "amount", money: true, width: 18 }, { header: "HSN", key: "hsn" },
    { header: "GST %", key: "rate", width: 8 }, { header: "Changed by CA", key: "ca", width: 22 },
  ], days.flatMap((d) => d.invoices.flatMap((inv) => inv.lines.map((l) => ({
    date: d.date, no: inv.invoiceNo, mode: modeLabel(inv.mode), item: l.item.name, qty: l.quantity, unit: l.item.unit,
    amount: rs(l.amountPaise), hsn: l.item.hsnCode ?? "", rate: l.item.gstRate,
    ca: inv.caEditedAt ? `${inv.caEditedBy ?? "CA"}, ${ist(inv.caEditedAt)}` : "",
  })))));

  // 4. Item-wise day totals with the GST split where a rate is mapped
  addSheet(wb, "Item-wise totals", [
    { header: "Date", key: "date" }, { header: "Item", key: "item", width: 30 }, { header: "HSN", key: "hsn" },
    { header: "GST %", key: "rate", width: 8 }, { header: "Qty", key: "qty", width: 8 },
    ...PAYMENT_MODES.map((m) => ({ header: m.label, key: m.field, money: true })),
    { header: "Total incl. GST", key: "amount", money: true, width: 16 },
    { header: "Taxable value", key: "taxable", money: true, width: 16 }, { header: "GST", key: "tax", money: true },
  ], days.flatMap((d) => d.lines.map((l) => {
    const split = l.item.gstRate != null ? splitInclusive(l.amountPaise, l.item.gstRate) : null;
    return {
      date: d.date, item: l.item.name, hsn: l.item.hsnCode ?? "", rate: l.item.gstRate, qty: l.quantity,
      ...Object.fromEntries(PAYMENT_MODES.map((m) => [m.field, rs(l[m.field])])),
      amount: rs(l.amountPaise), taxable: rs(split?.taxable), tax: rs(split?.tax),
    };
  })));

  // 5. Items and their HSN mapping
  addSheet(wb, "Items & HSN", [
    { header: "Item", key: "name", width: 30 }, { header: "Unit", key: "unit", width: 8 }, { header: "HSN", key: "hsn" },
    { header: "GST %", key: "rate", width: 8 }, { header: "Mapped by", key: "by", width: 18 }, { header: "Mapped on", key: "at", width: 20 },
  ], items.map((i) => ({
    name: i.name, unit: i.unit, hsn: i.hsnCode ?? "", rate: i.gstRate, by: i.mappedBy?.name ?? "", at: ist(i.mappedAt),
  })));

  // 6–9. Employees, salary history, attendance and monthly salary
  const today = todayIST();
  addSheet(wb, "Employees", [
    { header: "Name", key: "name", width: 24 }, { header: "Role", key: "role", width: 16 }, { header: "Phone", key: "phone", width: 14 },
    { header: "Joined", key: "join" }, { header: "Last working day", key: "left", width: 16 },
    { header: "Salary now", key: "salary", money: true },
  ], employees.map((e) => ({
    name: e.name, role: e.designation ?? "", phone: e.phone ?? "", join: e.joinDate, left: e.leftDate ?? "",
    salary: rs(salaryForMonth(e.salaries, today.slice(0, 7))),
  })));
  addSheet(wb, "Salary history", [
    { header: "Employee", key: "name", width: 24 }, { header: "From month", key: "month" },
    { header: "Monthly salary", key: "salary", money: true, width: 16 },
  ], employees.flatMap((e) => e.salaries.map((s) => ({ name: e.name, month: s.effectiveMonth, salary: rs(s.monthlyPaise) }))));
  addSheet(wb, "Attendance", [
    { header: "Employee", key: "name", width: 24 }, { header: "Date", key: "date" }, { header: "Mark", key: "mark", width: 22 },
  ], employees.flatMap((e) => e.attendance.map((a) => ({ name: e.name, date: a.date, mark: attendanceLabel(a.status) }))));

  const monthRows: Record<string, unknown>[] = [];
  for (const e of employees) {
    const marks = new Map(e.attendance.map((a) => [a.date, a.status]));
    const lastMonth = (e.leftDate && e.leftDate < today ? e.leftDate : today).slice(0, 7);
    for (let m = e.joinDate.slice(0, 7); m <= lastMonth; m = shiftMonth(m, 1)) {
      const monthly = salaryForMonth(e.salaries, m);
      if (monthly === null) continue;
      const s = summarizeMonth({ month: m, today, joinDate: e.joinDate, leftDate: e.leftDate, monthlyPaise: monthly, marks });
      monthRows.push({
        name: e.name, month: m, days: monthDates(m).length, employed: s.employedDays,
        P: s.counts.P, A: s.counts.A, H: s.counts.H, L: s.counts.L, O: s.counts.O, unmarked: s.unmarked,
        monthly: rs(s.monthlyPaise), perDay: rs(s.perDayPaise), deduction: rs(s.deductionPaise), payable: rs(s.payablePaise),
      });
    }
  }
  addSheet(wb, "Monthly salary", [
    { header: "Employee", key: "name", width: 24 }, { header: "Month", key: "month", width: 10 },
    { header: "Days in month", key: "days" }, { header: "Days employed", key: "employed" },
    { header: "Present", key: "P", width: 9 }, { header: "Absent", key: "A", width: 9 }, { header: "Half day", key: "H", width: 9 },
    { header: "Paid leave", key: "L", width: 10 }, { header: "Off", key: "O", width: 8 }, { header: "Not marked", key: "unmarked" },
    { header: "Monthly salary", key: "monthly", money: true, width: 15 }, { header: "Per day", key: "perDay", money: true },
    { header: "Deduction", key: "deduction", money: true }, { header: "Payable", key: "payable", money: true },
  ], monthRows);

  // 10. CA remarks
  addSheet(wb, "CA remarks", [
    { header: "Written", key: "at", width: 20 }, { header: "By", key: "by", width: 18 }, { header: "Sales day", key: "day" },
    { header: "Remark", key: "text", width: 70 }, { header: "Seen by merchant", key: "seen", width: 20 },
  ], remarks.map((r) => ({ at: ist(r.createdAt), by: r.authorName, day: r.saleDay?.date ?? "", text: r.text, seen: ist(r.seenAt) })));

  // 11. Uploaded invoice files (the files themselves are in the ZIP download)
  addSheet(wb, "Invoice files", [
    { header: "Sales day", key: "date" }, { header: "Payment mode", key: "mode", width: 14 },
    { header: "File name", key: "name", width: 36 }, { header: "Name in ZIP", key: "zip", width: 50 },
    { header: "Size (KB)", key: "kb" }, { header: "Uploaded", key: "at", width: 20 },
  ], days.flatMap((d) => d.attachments.map((a) => ({
    date: d.date, mode: a.mode ? modeLabel(a.mode) : "", name: a.fileName, zip: zipName(d.date, a),
    kb: Math.round(a.size / 1024), at: ist(a.createdAt),
  }))));

  // 12. Edit log for this merchant
  addSheet(wb, "Edit log", [
    { header: "#", key: "seq", width: 8 }, { header: "Time", key: "at", width: 20 }, { header: "Who", key: "who", width: 18 },
    { header: "Role", key: "role", width: 10 }, { header: "Sales day", key: "day" }, { header: "Action", key: "action", width: 24 },
    { header: "Summary", key: "summary", width: 60 }, { header: "Changes", key: "changes", width: 60 },
  ], log.map((e) => ({
    seq: e.seq, at: ist(e.createdAt), who: e.actorName, role: e.actorRole, day: e.saleDate ?? "",
    action: AUDIT_ACTIONS[e.action as AuditAction] ?? e.action, summary: e.summary, changes: auditChanges(e.details).join(" | "),
  })));

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const counts = { salesDays: days.length, items: items.length, employees: employees.length, files: days.reduce((n, d) => n + d.attachments.length, 0) };
  return { merchant, buffer, counts };
}

function zipName(date: string, a: { id: string; fileName: string }) {
  const clean = a.fileName.replace(/[\\/:*?"<>|]+/g, "_");
  return `${date}/${a.id.slice(-6)}-${clean}`;
}

/** ZIP of all the merchant's uploaded invoice files, in one folder per sales day. */
export async function buildInvoiceFilesZip(merchantId: string) {
  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return null;
  const files = await db.dayAttachment.findMany({
    where: { saleDay: { merchantId } }, include: { saleDay: { select: { date: true } } }, orderBy: { createdAt: "asc" },
  });
  const zip = new JSZip();
  const missing: string[] = [];
  for (const f of files) {
    try {
      zip.file(zipName(f.saleDay.date, f), await readUpload(f.storageKey));
    } catch {
      missing.push(`${f.saleDay.date} ${f.fileName}`);
    }
  }
  if (missing.length) zip.file("MISSING-FILES.txt", "These files were listed but not found on the server:\r\n" + missing.join("\r\n"));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  return { merchant, buffer, count: files.length - missing.length };
}
