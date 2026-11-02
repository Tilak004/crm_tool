"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { actorOf, audit } from "@/lib/audit";
import { DUMMY_PASSWORD_HASH, isCARole } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearPending, createSession, readPending, setPending } from "@/lib/session";
import { decryptSecret, encryptSecret, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

// CA login: step 1 password, step 2 the 6-digit code from an authenticator app.
// The first time, step 2 shows a QR code to set the app up.

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
/** Name shown for this account inside the authenticator app. */
const ISSUER = "PakkaLekka CA";

export type CALoginState =
  | { stage: "password"; error?: string }
  | { stage: "code"; error?: string }
  | { stage: "enroll"; qr: string; secret: string; error?: string };

const minutesLeft = (until: Date) => Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));

export async function caPasswordStep(_prev: CALoginState, form: FormData): Promise<CALoginState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { stage: "password", error: "Enter username and password." };

  const user = await db.user.findUnique({ where: { username } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk || !user.active || !isCARole(user.role)) {
    return { stage: "password", error: "Invalid username or password." };
  }
  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    return { stage: "password", error: `Too many wrong codes. Try again in ${minutesLeft(user.totpLockedUntil)} minute(s).` };
  }

  if (user.totpSecret) {
    await setPending({ userId: user.id, stage: "code" });
    return { stage: "code" };
  }
  // First login: set up the authenticator app.
  const secret = newTotpSecret();
  await setPending({ userId: user.id, stage: "enroll", secret });
  const qr = await QRCode.toDataURL(otpauthUrl(secret, user.username, ISSUER), { margin: 1, width: 220 });
  return { stage: "enroll", qr, secret };
}

export async function caCodeStep(prev: CALoginState, form: FormData): Promise<CALoginState> {
  const pending = await readPending();
  if (!pending) return { stage: "password", error: "That took too long. Please sign in again." };
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !isCARole(user.role)) {
    await clearPending();
    return { stage: "password", error: "Please sign in again." };
  }
  const again = (error: string): CALoginState => (prev.stage === "enroll" ? { ...prev, error } : { stage: "code", error });

  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    await clearPending();
    return { stage: "password", error: `Too many wrong codes. Try again in ${minutesLeft(user.totpLockedUntil)} minute(s).` };
  }

  const enrolling = pending.stage === "enroll" && !!pending.secret && !user.totpSecret;
  const secret = enrolling ? pending.secret! : user.totpSecret ? decryptSecret(user.totpSecret) : null;
  if (!secret) { await clearPending(); return { stage: "password", error: "Please sign in again." }; }

  const step = verifyTotp(secret, String(form.get("code") ?? ""), user.totpLastStep);
  if (step === null) {
    const failures = user.totpFailures + 1;
    const lock = failures >= MAX_FAILURES;
    await db.user.update({
      where: { id: user.id },
      data: lock
        ? { totpFailures: 0, totpLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
        : { totpFailures: failures },
    });
    if (lock) {
      await clearPending();
      return { stage: "password", error: `Too many wrong codes. This account is locked for ${LOCK_MINUTES} minutes.` };
    }
    return again(`Wrong code (${MAX_FAILURES - failures} attempt(s) left). Use the current 6-digit code from the app.`);
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        totpLastStep: step, totpFailures: 0, totpLockedUntil: null,
        ...(enrolling ? { totpSecret: encryptSecret(secret), totpEnabledAt: new Date() } : {}),
      },
    });
    if (enrolling) {
      await audit(tx, {
        actor: actorOf(user), action: "TWO_FACTOR_ENROLLED",
        summary: `${user.username} set up their authenticator app`, details: { userId: user.id },
      });
    }
  });
  await clearPending();
  await createSession(user.id, true);
  redirect("/ca");
}

export async function caCancel(): Promise<CALoginState> {
  await clearPending();
  return { stage: "password" };
}

/** Single entry point for the login form; the hidden "step" field picks the step. */
export async function caLogin(prev: CALoginState, form: FormData): Promise<CALoginState> {
  const step = form.get("step");
  if (step === "cancel") return caCancel();
  if (step === "code") return caCodeStep(prev, form);
  return caPasswordStep(prev, form);
}
