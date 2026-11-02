// Creates the first CA admin account. Run with --demo to also add a sample merchant.
//   npm run seed            -> admin / admin12345 (change after first login)
//   npm run seed -- --demo  -> plus merchant login demo-shop / demo12345
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const adminUser = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";

  if (await db.user.findUnique({ where: { username: adminUser } })) {
    console.log(`Admin "${adminUser}" already exists.`);
  } else {
    await db.user.create({
      data: { name: "CA Admin", username: adminUser, role: "ADMIN", passwordHash: await bcrypt.hash(adminPass, 10) },
    });
    // Only echo the password when it's the well-known development default.
    console.log(`Created admin: ${adminUser}${process.env.SEED_ADMIN_PASSWORD ? "" : ` / ${adminPass}`}`);
  }

  if (process.argv.includes("--demo") && !(await db.user.findUnique({ where: { username: "demo-shop" } }))) {
    const merchant = await db.merchant.create({
      data: {
        businessName: "Sri Lakshmi General Stores",
        gstin: "36ABCDE1234F1Z5",
        phone: "9876543210",
        users: {
          create: { name: "Ramesh", username: "demo-shop", role: "MERCHANT", passwordHash: await bcrypt.hash("demo12345", 10) },
        },
      },
    });
    console.log(`Created demo merchant ${merchant.businessName}: demo-shop / demo12345`);
  }
}

main().finally(() => db.$disconnect());
