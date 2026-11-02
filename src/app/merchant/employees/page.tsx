import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Disclosure from "@/components/Disclosure";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, todayIST } from "@/lib/gst";
import { monthLabel, salaryForMonth } from "@/lib/payroll";
import { addEmployee, changeSalary, updateEmployee } from "./actions";

export default async function EmployeesPage() {
  const { merchant } = await requireMerchant();
  const today = todayIST();
  const employees = await db.employee.findMany({
    where: { merchantId: merchant.id },
    include: { salaries: { orderBy: { effectiveMonth: "desc" } } },
    orderBy: [{ leftDate: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });

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

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Phone</th><th className="text-right">Salary now</th><th>Joined</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No employees yet. Add your first one above.</td></tr>
            )}
            {employees.map((e) => {
              const current = salaryForMonth(e.salaries, today.slice(0, 7));
              const left = e.leftDate && e.leftDate < today;
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
                      : <span className="badge bg-green-100 text-green-800">Working</span>}
                  </td>
                  <td className="min-w-72">
                    <Disclosure summary="Edit" defaultOpen={false}>
                      <div className="mt-3 space-y-4">
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
