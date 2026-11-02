import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaff, resetPassword, setUserActive } from "../../actions";

export default async function AdminStaff() {
  const me = await requireAdmin();
  const staff = await db.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { mappedItems: true } } },
  });

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h1 className="mb-4 text-lg font-semibold">Add CA staff</h1>
        <ActionForm action={createStaff} submitLabel="Create account" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="name">Name *</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="username">Username *</label>
              <input className="input" id="username" name="username" required autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password * (min 8)</label>
              <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select className="input" id="role" name="role" defaultValue="STAFF">
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin (can manage accounts)</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </section>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Username</th><th>Role</th><th className="text-right">Items mapped</th><th>Status</th><th>Reset password</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}{u.id === me.id && <span className="text-gray-400"> (you)</span>}</td>
                <td>{u.username}</td>
                <td>{u.role === "ADMIN" ? "Admin" : "Staff"}</td>
                <td className="text-right">{u._count.mappedItems}</td>
                <td>
                  {u.active
                    ? <span className="badge bg-green-100 text-green-800">Active</span>
                    : <span className="badge bg-red-100 text-red-700">Inactive</span>}
                </td>
                <td>
                  <ActionForm action={resetPassword.bind(null, u.id)} submitLabel="Set" className="flex items-center gap-2">
                    <input className="input w-36 py-1" name="password" type="password" placeholder="New password" required minLength={8} autoComplete="new-password" />
                  </ActionForm>
                </td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <form action={setUserActive.bind(null, u.id, !u.active)}>
                      <button className={`btn py-1 text-xs ${u.active ? "btn-danger" : "btn-secondary"}`}>
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
