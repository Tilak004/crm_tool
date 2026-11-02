// Permanently deletes a merchant (e.g. a test merchant) with all their data.
//   npm run delete-merchant -- <merchant's login username>          shows what would be deleted
//   npm run delete-merchant -- <merchant's login username> --yes    deletes it
// On the server use:  sudo bash /opt/gst-portal/deploy/delete-merchant.sh <username>
// The admin can do the same from CA Admin → Merchants (Deactivate, then Delete…).
import { actorOf, audit } from "../src/lib/audit";
import { db } from "../src/lib/db";
import { deleteMerchantRecords, describeFootprint, merchantFootprint } from "../src/lib/merchant-delete";
import { deleteMerchantUploads } from "../src/lib/uploads";

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  const confirmed = process.argv.includes("--yes");
  if (!username) throw new Error("Usage: npm run delete-merchant -- <merchant's login username> [--yes]");
  const user = await db.user.findUnique({ where: { username }, include: { merchant: true } });
  if (!user) throw new Error(`No user called "${username}".`);
  const merchant = user.merchant;
  if (user.role !== "MERCHANT" || !merchant) throw new Error(`"${username}" is not a merchant login. CA accounts can't be deleted this way.`);

  const footprint = await merchantFootprint(db, merchant.id);
  if (!confirmed) {
    console.log(`Merchant: ${merchant.businessName}${merchant.gstin ? ` (GSTIN ${merchant.gstin})` : ""}`);
    console.log(`Will delete: ${describeFootprint(footprint)}`);
    return;
  }
  await db.$transaction(async (tx) => {
    await deleteMerchantRecords(tx, merchant.id);
    await audit(tx, {
      actor: actorOf({ id: "system", name: "Server command", role: "SYSTEM" }), action: "MERCHANT_DELETED", merchant,
      summary: `Deleted permanently: ${describeFootprint(footprint)}`,
      details: { ...footprint, gstin: merchant.gstin, usernames: [username] },
    });
  }, { timeout: 60_000 });
  await deleteMerchantUploads(merchant.id);
  console.log(`Deleted ${merchant.businessName}.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
