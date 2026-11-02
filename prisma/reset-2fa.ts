// Emergency reset of a CA user's authenticator, e.g. when the only admin lost their phone.
//   npm run reset-2fa -- <username>
// On the server use:  sudo bash /opt/gst-portal/deploy/reset-2fa.sh <username>
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  if (!username) throw new Error("Usage: npm run reset-2fa -- <username>");
  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error(`No user called "${username}".`);
  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpFailures: 0, totpLockedUntil: null },
  });
  console.log(`Authenticator reset for ${username}. They will scan a new QR code at their next sign-in at /ca-login.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
