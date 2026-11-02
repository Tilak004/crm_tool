"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { DUMMY_PASSWORD_HASH, currentUser, loginPathFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearPending, createSession, destroySession } from "@/lib/session";

/** Client (merchant) login. CA accounts are refused here; they use /ca-login. */
export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return "Enter username and password.";

  const user = await db.user.findUnique({ where: { username }, include: { merchant: true } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const ok = user && passwordOk && user.active && user.role === "MERCHANT" && user.merchant?.active;
  if (!ok) return "Invalid username or password.";

  await createSession(user.id);
  redirect("/merchant");
}

export async function logout() {
  const user = await currentUser();
  await destroySession();
  await clearPending();
  redirect(user ? loginPathFor(user.role) : "/login");
}
