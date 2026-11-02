import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "session";
const PENDING_COOKIE = "ca_pending";
const MAX_AGE_SECONDS = 60 * 60 * 12;
const PENDING_SECONDS = 60 * 10;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** mfa: the user passed the authenticator-code check (required for CA accounts). */
export async function createSession(userId: string, mfa = false) {
  const token = await new SignJWT({ sub: userId, mfa })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, cookieOptions(MAX_AGE_SECONDS));
}

export async function readSession(): Promise<{ userId: string; mfa: boolean } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.sub === "string" ? { userId: payload.sub, mfa: payload.mfa === true } : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

// ---- CA login in progress: password accepted, authenticator code still needed.

export type Pending = { userId: string; stage: "code" | "enroll"; secret?: string };

export async function setPending(p: Pending) {
  const token = await new SignJWT({ sub: p.userId, stage: p.stage, ...(p.secret ? { secret: p.secret } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_SECONDS}s`)
    .sign(key());
  (await cookies()).set(PENDING_COOKIE, token, cookieOptions(PENDING_SECONDS));
}

export async function readPending(): Promise<Pending | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.sub !== "string" || (payload.stage !== "code" && payload.stage !== "enroll")) return null;
    return { userId: payload.sub, stage: payload.stage, secret: typeof payload.secret === "string" ? payload.secret : undefined };
  } catch {
    return null;
  }
}

export async function clearPending() {
  (await cookies()).delete(PENDING_COOKIE);
}
