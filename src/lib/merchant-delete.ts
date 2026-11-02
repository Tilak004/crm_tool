import type { Prisma } from "@prisma/client";

// Permanently removes a merchant and everything under it. Used by the admin's
// Delete button and by the server command (prisma/delete-merchant.ts). The
// edit log is not touched: its entries keep the merchant's name, and the
// deletion itself is logged by the caller.

/** What a deletion would remove, for the confirmation message and the log. */
export async function merchantFootprint(tx: Prisma.TransactionClient, merchantId: string) {
  const [salesDays, invoices, items, employees, attendanceMarks, files, logins] = await Promise.all([
    tx.saleDay.count({ where: { merchantId } }),
    tx.invoice.count({ where: { saleDay: { merchantId } } }),
    tx.item.count({ where: { merchantId } }),
    tx.employee.count({ where: { merchantId } }),
    tx.attendance.count({ where: { employee: { merchantId } } }),
    tx.dayAttachment.count({ where: { saleDay: { merchantId } } }),
    tx.user.count({ where: { merchantId } }),
  ]);
  return { salesDays, invoices, items, employees, attendanceMarks, files, logins };
}

export type Footprint = Awaited<ReturnType<typeof merchantFootprint>>;

export const describeFootprint = (f: Footprint) =>
  [
    `${f.salesDays} sales day(s)`, `${f.invoices} invoice(s)`, `${f.items} item(s)`,
    `${f.employees} employee(s)`, `${f.attendanceMarks} attendance mark(s)`,
    `${f.files} uploaded file(s)`, `${f.logins} login(s)`,
  ].join(", ");

/** Deletes the rows, children first. Uploaded files are removed separately (lib/uploads.ts). */
export async function deleteMerchantRecords(tx: Prisma.TransactionClient, merchantId: string) {
  await tx.remark.deleteMany({ where: { merchantId } });
  // Invoices, lines, payments, revisions and file records cascade from the day.
  await tx.saleDay.deleteMany({ where: { merchantId } });
  await tx.item.deleteMany({ where: { merchantId } });
  await tx.attendance.deleteMany({ where: { employee: { merchantId } } });
  await tx.employeeSalary.deleteMany({ where: { employee: { merchantId } } });
  await tx.employee.deleteMany({ where: { merchantId } });
  await tx.user.deleteMany({ where: { merchantId } });
  await tx.merchant.delete({ where: { id: merchantId } });
}
