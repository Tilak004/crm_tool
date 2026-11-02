// Emergency password reset, e.g. when the admin can't sign in.
//   NEW_PASSWORD=... npm run reset-password -- <username>
// On the server use:  sudo bash /opt/gst-portal/deploy/reset-password.sh <username>
// (it asks for the password without showing it).
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? "";
  if (!username) throw new Error("Usage: NEW_PASSWORD=... npm run reset-password -- <username>");
  if (password.length < 8) throw new Error("The new password must be at least 8 characters.");
  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error(`No user called "${username}".`);
  await db.user.update({
    where: { id: user.id },
    // Also re-activates the account and clears any wrong-code lock.
    data: { passwordHash: await bcrypt.hash(password, 10), active: true, totpFailures: 0, totpLockedUntil: null },
  });
  console.log(`Password changed for ${username}.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
