"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

/** Marks after an employee's last working day no longer count; remove them so the sheet stays clean. */
async function clearMarksAfter(tx: Prisma.TransactionClient, employeeId: string, leftDate: string | null) {
  if (!leftDate) return 0;
  const { count } = await tx.attendance.deleteMany({ where: { employeeId, date: { gt: leftDate } } });
  return count;
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

  const removed = await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { name, designation, phone, leftDate } });
    const removed = await clearMarksAfter(tx, e.id, leftDate);
    await audit(tx, {
      actor: actorOf(user), action: "EMPLOYEE_UPDATED", merchant,
      summary: `${e.name}: ${changes.join("; ")}${removed ? `; ${removed} attendance mark(s) after the last day removed` : ""}`,
      details: { employeeId: e.id, before, after, marksRemoved: removed },
    });
    return removed;
  });
  revalidate();
  return { ok: true, message: removed ? `Saved. ${removed} attendance mark(s) after the last day were removed.` : "Saved." };
}

/**
 * "Left the company": sets the last working day. The employee and their
 * attendance and salary history stay in the database (and visible to the CA);
 * they just stop appearing in the employee list and daily attendance.
 */
export async function markEmployeeLeft(employeeId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const { user, merchant } = await requireMerchant();
  const e = await ownEmployee(merchant.id, employeeId);
  if (!e) return { ok: false, message: "Employee not found." };
  const leftDate = String(form.get("leftDate") ?? "");
  if (!isValidDate(leftDate) || leftDate < e.joinDate) return { ok: false, message: "Last working day must be on or after the joining date." };

  const removed = await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { leftDate } });
    const removed = await clearMarksAfter(tx, e.id, leftDate);
    await audit(tx, {
      actor: actorOf(user), action: "EMPLOYEE_LEFT", merchant,
      summary: `${e.name}: last working day ${leftDate}${removed ? `; ${removed} later attendance mark(s) removed` : ""}`,
      details: { employeeId: e.id, leftDate, previousLeftDate: e.leftDate, marksRemoved: removed },
    });
    return removed;
  });
  revalidate();
  // The row leaves the list, so the confirmation is shown at the top of the page.
  redirect(`/merchant/employees?left=${encodeURIComponent(e.name)}&removed=${removed}`);
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

export type MarkChange = { employeeId: string; date: string; status: string | null };
export type SaveMarksResult = { ok: boolean; message: string; failed: { employeeId: string; date: string; message: string }[] };

/**
 * Saves a batch of attendance marks (status null clears a mark). The screens
 * collect taps for a few seconds and send them together, so a round of marking
 * becomes one edit-log entry per date instead of one per tap.
 */
export async function saveAttendance(changes: MarkChange[]): Promise<SaveMarksResult> {
  const { user, merchant } = await requireMerchant();
  if (!Array.isArray(changes) || changes.length === 0) return { ok: true, message: "Nothing to save.", failed: [] };
  if (changes.length > 5000) return { ok: false, message: "Too many changes at once.", failed: [] };

  // The last change to the same employee and day wins.
  const latest = new Map<string, MarkChange>();
  for (const c of changes) {
    if (typeof c?.employeeId !== "string" || typeof c?.date !== "string" || (c.status !== null && typeof c.status !== "string")) {
      return { ok: false, message: "Invalid request.", failed: [] };
    }
    latest.set(`${c.employeeId}|${c.date}`, c);
  }
  const wanted = [...latest.values()];
  const employees = await db.employee.findMany({
    where: { merchantId: merchant.id, id: { in: [...new Set(wanted.map((c) => c.employeeId))] } },
    include: { attendance: { where: { date: { in: [...new Set(wanted.map((c) => c.date))] } } } },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));
  const today = todayIST();

  const failed: SaveMarksResult["failed"] = [];
  const apply: { e: (typeof employees)[number]; date: string; from: string | null; to: string | null }[] = [];
  for (const c of wanted) {
    const e = byId.get(c.employeeId);
    const fail = (message: string) => failed.push({ employeeId: c.employeeId, date: c.date, message });
    if (!e) { fail("Employee not found."); continue; }
    if (!isValidDate(c.date) || c.date > today) { fail("You can't mark future dates."); continue; }
    if (!isEmployedOn(e, c.date)) { fail(`${e.name} wasn't employed on that date.`); continue; }
    if (c.status !== null && !isAttendanceStatus(c.status)) { fail("Unknown mark."); continue; }
    const from = e.attendance.find((a) => a.date === c.date)?.status ?? null;
    if (from !== c.status) apply.push({ e, date: c.date, from, to: c.status });
  }

  if (apply.length > 0) {
    await db.$transaction(async (tx) => {
      for (const a of apply) {
        if (a.to === null) await tx.attendance.delete({ where: { employeeId_date: { employeeId: a.e.id, date: a.date } } });
        else {
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: a.e.id, date: a.date } },
            create: { employeeId: a.e.id, date: a.date, status: a.to, updatedById: user.id },
            update: { status: a.to, updatedById: user.id },
          });
        }
      }
      // One entry per date, e.g. "Present: Ravi, Sita · Absent: Gopal (was Present)".
      for (const date of [...new Set(apply.map((a) => a.date))].sort()) {
        const onDate = apply.filter((a) => a.date === date);
        const groups = new Map<string | null, string[]>();
        for (const a of onDate) {
          groups.set(a.to, [...(groups.get(a.to) ?? []), `${a.e.name}${a.from ? ` (was ${attendanceLabel(a.from)})` : ""}`]);
        }
        await audit(tx, {
          actor: actorOf(user), action: "ATTENDANCE_MARKED", merchant, saleDate: date,
          summary: [...groups].map(([to, names]) => `${attendanceLabel(to)}: ${names.join(", ")}`).join(" · "),
          details: { date, marks: onDate.map((a) => ({ employeeId: a.e.id, name: a.e.name, from: a.from, to: a.to })) },
        });
      }
    }, { timeout: 30_000 });
    revalidatePath("/merchant/attendance", "layout");
    revalidatePath("/ca", "layout");
  }
  const saved = wanted.length - failed.length;
  return {
    ok: failed.length === 0,
    message: failed.length === 0 ? "Saved" : `${saved} saved, ${failed.length} not saved: ${failed[0].message}`,
    failed,
  };
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
