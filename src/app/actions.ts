"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return "Enter username and password.";

  const user = await db.user.findUnique({ where: { username }, include: { merchant: true } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || (user.role === "MERCHANT" && !user.merchant?.active)) return "Invalid username or password.";

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
