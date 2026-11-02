// Loads the official HSN/SAC directory into the database.
//   npm run hsn:import                      -> downloads from the GST portal
//   npm run hsn:import -- path\to\file.xlsx  -> uses a file you downloaded yourself
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { GST_PORTAL_HSN_URL, downloadFromGstPortal, importHsnWorkbook } from "../src/lib/hsn-import";

const db = new PrismaClient();

async function main() {
  const file = process.argv[2];
  let buffer: ArrayBuffer;
  if (file) {
    const b = await readFile(file);
    buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  } else {
    console.log(`Downloading ${GST_PORTAL_HSN_URL} ...`);
    buffer = await downloadFromGstPortal();
  }
  const s = await importHsnWorkbook(db, buffer, file ?? GST_PORTAL_HSN_URL, null);
  console.log(`Imported ${s.goodsCount} HSN (goods) and ${s.servicesCount} SAC (services) codes; skipped ${s.skipped} malformed rows.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
