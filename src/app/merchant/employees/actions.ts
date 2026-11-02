"use server";

import { revalidatePath } from "next/cache";
import { actorOf, audit } from "@/lib/audit";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPaise, isValidDate, rupeesToPaise, todayIST } from "@/lib/gst";
import { attendanceLabel, isAttendanceStatus, isEmployedOn, isValidMonth } from "@/lib/payroll";

type Result = { ok: boolean; message: string };

const MAX_SALARY_PAISE = 100_00_000_00; // ₹1 crore a month

function readSalary(form: FormData): number | { error: string } {
  const paise = rupeesToPaise(String(form.get("salary") ?? ""));
  if (paise === null || paise <= 0 || paise > MAX_SALARY_PAISE) return { error: "Enter the monthly salary in rupees." };
  return paise;
}

async function ownEmployee(merchantId: string, employeeId: string) {
  const e = await db.employee.findUnique({ where: { id: employeeId } });
  return e && e.merchantId === merchantId ? e : null;
}

function revalidate() {
  revalidatePath("/merchant/employees");
  revalidatePath("/merchant/attendance");
  revalidatePath("/ca", "layout");
}

export async function addEmployee(_prev: Result | null, form: FormData): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  const name = String(form.get("name") ?? "").trim();
  const designation = String(form.get("designation") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const joinDate = String(form.get("joinDate") ?? "");
  if (!name || name.length > 100) return { ok: false, message: "Enter the employee's name." };
  if (!isValidDate(joinDate)) return { ok: false, message: "Enter the joining date." };
  const salary = readSalary(form);
  if (typeof salary !== "number") return { ok: false, message: salary.error };

  await db.$transaction(async (tx) => {
    const e = await tx.employee.create({
      data: {
        merchantId: merchant.id, name, designation: designation || null, phone: phone || null, joinDate,
        salaries: { create: { effectiveMonth: joinDate.slice(0, 7), monthlyPaise: salary } },
      },
    });
    await audit(tx, {
      actor: actorOf(user), action: "EMPLOYEE_ADDED", merchant,
      summary: `${name}${designation ? ` (${designation})` : ""}, ${formatPaise(salary)}/month, joined ${joinDate}`,
      details: { employeeId: e.id, name, designation, phone, joinDate, monthlyPaise: salary },
    });
  });
  revalidate();
  return { ok: true, message: `${name} added.` };
}

export async function updateEmployee(employeeId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  const e = await ownEmployee(merchant.id, employeeId);
  if (!e) return { ok: false, message: "Employee not found." };
  const name = String(form.get("name") ?? "").trim();
  const designation = String(form.get("designation") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  const leftRaw = String(form.get("leftDate") ?? "");
  const leftDate = leftRaw || null;
  if (!name || name.length > 100) return { ok: false, message: "Enter the employee's name." };
  if (leftDate && (!isValidDate(leftDate) || leftDate < e.joinDate)) return { ok: false, message: "Last working day must be on or after the joining date." };

  const before = { Name: e.name, Role: e.designation ?? "", Phone: e.phone ?? "", "Last working day": e.leftDate ?? "" };
  const after = { Name: name, Role: designation ?? "", Phone: phone ?? "", "Last working day": leftDate ?? "" };
  const changes = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k] || "—"} → ${after[k] || "—"}`);
  if (changes.length === 0) return { ok: true, message: "No changes." };

  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { name, designation, phone, leftDate } });
    await audit(tx, {
      actor: actorOf(user), action: "EMPLOYEE_UPDATED", merchant,
      summary: `${e.name}: ${changes.join("; ")}`, details: { employeeId: e.id, before, after },
    });
  });
  revalidate();
  return { ok: true, message: "Saved." };
}

export async function changeSalary(employeeId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  const e = await ownEmployee(merchant.id, employeeId);
  if (!e) return { ok: false, message: "Employee not found." };
  const month = String(form.get("effectiveMonth") ?? "");
  if (!isValidMonth(month)) return { ok: false, message: "Choose the month the new salary starts." };
  if (month < e.joinDate.slice(0, 7)) return { ok: false, message: "The salary can't start before the joining month." };
  const salary = readSalary(form);
  if (typeof salary !== "number") return { ok: false, message: salary.error };

  await db.$transaction(async (tx) => {
    const prev = await tx.employeeSalary.findUnique({ where: { employeeId_effectiveMonth: { employeeId, effectiveMonth: month } } });
    await tx.employeeSalary.upsert({
      where: { employeeId_effectiveMonth: { employeeId, effectiveMonth: month } },
      create: { employeeId, effectiveMonth: month, monthlyPaise: salary },
      update: { monthlyPaise: salary },
    });
    await audit(tx, {
      actor: actorOf(user), action: "SALARY_CHANGED", merchant,
      summary: `${e.name}: ${formatPaise(salary)}/month from ${month}${prev ? ` (was ${formatPaise(prev.monthlyPaise)})` : ""}`,
      details: { employeeId, effectiveMonth: month, monthlyPaise: salary, previousPaise: prev?.monthlyPaise ?? null },
    });
  });
  revalidate();
  return { ok: true, message: "Salary updated." };
}

/** Sets (or clears, with status null) one day's mark. */
export async function setAttendance(employeeId: string, date: string, status: string | null): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  const e = await ownEmployee(merchant.id, employeeId);
  if (!e) return { ok: false, message: "Employee not found." };
  if (!isValidDate(date) || date > todayIST()) return { ok: false, message: "You can't mark future dates." };
  if (!isEmployedOn(e, date)) return { ok: false, message: `${e.name} wasn't employed on that date.` };
  if (status !== null && !isAttendanceStatus(status)) return { ok: false, message: "Unknown mark." };

  await db.$transaction(async (tx) => {
    const prev = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    if ((prev?.status ?? null) === status) return;
    if (status === null) await tx.attendance.delete({ where: { id: prev!.id } });
    else {
      await tx.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: { employeeId, date, status, updatedById: user.id },
        update: { status, updatedById: user.id },
      });
    }
    await audit(tx, {
      actor: actorOf(user), action: "ATTENDANCE_MARKED", merchant, saleDate: date,
      summary: `${e.name}: ${attendanceLabel(status)}${prev ? ` (was ${attendanceLabel(prev.status)})` : ""}`,
      details: { employeeId, date, from: prev?.status ?? null, to: status },
    });
  });
  revalidatePath("/merchant/attendance");
  revalidatePath("/ca", "layout");
  return { ok: true, message: "Saved" };
}

/** Marks every employee present on a date, skipping anyone already marked or not employed then. */
export async function markAllPresent(date: string): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  if (!isValidDate(date) || date > todayIST()) return { ok: false, message: "You can't mark future dates." };
  const employees = await db.employee.findMany({
    where: { merchantId: merchant.id, attendance: { none: { date } } },
  });
  const targets = employees.filter((e) => isEmployedOn(e, date));
  if (targets.length === 0) return { ok: true, message: "Everyone is already marked for that day." };

  await db.$transaction(async (tx) => {
    for (const e of targets) {
      await tx.attendance.create({ data: { employeeId: e.id, date, status: "P", updatedById: user.id } });
    }
    await audit(tx, {
      actor: actorOf(user), action: "ATTENDANCE_MARKED", merchant, saleDate: date,
      summary: `Marked present: ${targets.map((e) => e.name).join(", ")}`,
      details: { date, employeeIds: targets.map((e) => e.id), to: "P" },
    });
  });
  revalidatePath("/merchant/attendance");
  revalidatePath("/ca", "layout");
  return { ok: true, message: `${targets.length} marked present.` };
}
