import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSession } from "./session";

export type Role = "ADMIN" | "STAFF" | "MERCHANT";

export const isCARole = (role: string) => role === "ADMIN" || role === "STAFF";

/**
 * A real bcrypt hash of a random throwaway password. Checked when a username
 * doesn't exist, so a wrong username takes as long as a wrong password and
 * doesn't reveal which accounts exist.
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$.fRCuimHgqVQWX2xFm1KVe57HPPNRMi2Lkc3d80LOPrppTKpq3n42";

/** Clients sign in at /login; CA admin and staff at /ca-login (password + authenticator code). */
export const loginPathFor = (role: string) => (isCARole(role) ? "/ca-login" : "/login");

export async function currentUser() {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { merchant: true } });
  if (!user || !user.active) return null;
  if (user.role === "MERCHANT" && (!user.merchant || !user.merchant.active)) return null;
  // A CA session only counts once the authenticator code was checked.
  if (isCARole(user.role) && !session.mfa) return null;
  return user;
}

/** Returns the logged-in user, or redirects if not logged in / wrong role. */
export async function requireRole(...roles: Role[]) {
  const user = await currentUser();
  if (!user) redirect(roles.includes("MERCHANT") ? "/login" : "/ca-login");
  if (!roles.includes(user.role as Role)) redirect("/");
  return user;
}

export const requireCA = () => requireRole("ADMIN", "STAFF");
export const requireAdmin = () => requireRole("ADMIN");

export async function requireMerchant() {
  const user = await requireRole("MERCHANT");
  return { user, merchant: user.merchant! };
}
