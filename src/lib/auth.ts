import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSessionUserId } from "./session";

export type Role = "ADMIN" | "STAFF" | "MERCHANT";

export async function currentUser() {
  const id = await readSessionUserId();
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, include: { merchant: true } });
  if (!user || !user.active) return null;
  if (user.role === "MERCHANT" && (!user.merchant || !user.merchant.active)) return null;
  return user;
}

/** Returns the logged-in user, or redirects if not logged in / wrong role. */
export async function requireRole(...roles: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role as Role)) redirect("/");
  return user;
}

export const requireCA = () => requireRole("ADMIN", "STAFF");
export const requireAdmin = () => requireRole("ADMIN");

export async function requireMerchant() {
  const user = await requireRole("MERCHANT");
  return { user, merchant: user.merchant! };
}
