import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Disclosure from "@/components/Disclosure";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, todayIST } from "@/lib/gst";
import { monthLabel, salaryForMonth } from "@/lib/payroll";
import { addEmployee, changeSalary, markEmployeeLeft, updateEmployee } from "./actions";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ show?: string; left?: string; removed?: string }> }) {
  const { merchant } = await requireMerchant();
  const sp = await searchParams;
  const showFormer = sp.show === "former";
  const removedMarks = Number(sp.removed) || 0;
  const today = todayIST();
  const all = await db.employee.findMany({
    where: { merchantId: merchant.id },
    include: { salaries: { orderBy: { effectiveMonth: "desc" } } },
    orderBy: { name: "asc" },
  });
  // Someone whose last working day is today or later still works here until then.
  const hasLeft = (e: { leftDate: string | null }) => !!e.leftDate && e.leftDate < today;
  const formerCount = all.filter(hasLeft).length;
  const employees = all.filter((e) => hasLeft(e) === showFormer);

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="mr-auto text-lg font-semibold">Employees</h1>
          <Link href="/merchant/attendance" className="text-sm text-blue-700 hover:underline">Open attendance sheet →</Link>
        </div>
        <ActionForm action={addEmployee} submitLabel="Add employee" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-5">
            <Field name="name" label="Name *" required maxLength={100} />
            <Field name="designation" label="Role" placeholder="e.g. Cashier" />
            <Field name="phone" label="Phone" />
            <Field name="salary" label="Monthly salary (₹) *" required inputMode="decimal" />
            <Field name="joinDate" label="Joining date *" required type="date" max={today} />
          </div>
        </ActionForm>
      </section>

      {sp.left && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {sp.left} moved to Former employees. Their attendance and salary records are kept.
          {removedMarks > 0 && ` ${removedMarks} attendance mark(s) after the last working day were removed.`}
        </p>
      )}
      <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm" role="tablist">
        <Link href="/merchant/employees" role="tab" aria-selected={!showFormer}
          className={`rounded-md px-4 py-1.5 ${!showFormer ? "bg-blue-700 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
          Working ({all.length - formerCount})
        </Link>
        <Link href="/merchant/employees?show=former" role="tab" aria-selected={showFormer}
          className={`rounded-md px-4 py-1.5 ${showFormer ? "bg-blue-700 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
          Former employees ({formerCount})
        </Link>
      </div>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Phone</th><th className="text-right">Salary now</th><th>Joined</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">
                {showFormer ? "No former employees." : "No employees yet. Add your first one above."}
              </td></tr>
            )}
            {employees.map((e) => {
              const current = salaryForMonth(e.salaries, today.slice(0, 7));
              const left = hasLeft(e);
              return (
                <tr key={e.id} className="align-top">
                  <td className="font-medium">{e.name}</td>
                  <td>{e.designation ?? "—"}</td>
                  <td>{e.phone ?? "—"}</td>
                  <td className="text-right">{current !== null ? formatPaise(current) : "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(e.joinDate)}</td>
                  <td>
                    {left
                      ? <span className="badge bg-gray-200 text-gray-700">Left {formatDate(e.leftDate!)}</span>
                      : e.leftDate
                        ? <span className="badge bg-amber-100 text-amber-800">Leaving {formatDate(e.leftDate)}</span>
                        : <span className="badge bg-green-100 text-green-800">Working</span>}
                  </td>
                  <td className="min-w-72">
                    <Disclosure summary={e.leftDate ? "Edit" : "Edit / Remove"} defaultOpen={false}>
                      <div className="mt-3 space-y-4">
                        {!e.leftDate && (
                          <ActionForm action={markEmployeeLeft.bind(null, e.id)} submitLabel="Left the company" className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <Field name="leftDate" label="Last working day" type="date" required defaultValue={today} min={e.joinDate} />
                            <p className="text-xs text-gray-500">
                              {e.name} moves to Former employees and stops appearing in daily attendance after this day.
                              Past attendance and salary records are kept.
                            </p>
                          </ActionForm>
                        )}
                        <ActionForm action={updateEmployee.bind(null, e.id)} submitLabel="Save details" resetOnSuccess={false} className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field name="name" label="Name" defaultValue={e.name} required />
                            <Field name="designation" label="Role" defaultValue={e.designation ?? ""} />
                            <Field name="phone" label="Phone" defaultValue={e.phone ?? ""} />
                            <Field name="leftDate" label="Last working day (if left)" type="date" defaultValue={e.leftDate ?? ""} min={e.joinDate} />
                          </div>
                        </ActionForm>
                        <ActionForm action={changeSalary.bind(null, e.id)} submitLabel="Change salary" className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field name="salary" label="New monthly salary (₹)" required inputMode="decimal" />
                            <Field name="effectiveMonth" label="From month" type="month" required min={e.joinDate.slice(0, 7)} defaultValue={today.slice(0, 7)} />
                          </div>
                        </ActionForm>
                        <div className="text-xs text-gray-500">
                          Salary history:{" "}
                          {e.salaries.map((s) => `${formatPaise(s.monthlyPaise)} from ${monthLabel(s.effectiveMonth)}`).join(" · ")}
                        </div>
                      </div>
                    </Disclosure>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" name={name} aria-label={label} {...rest} />
    </div>
  );
}
