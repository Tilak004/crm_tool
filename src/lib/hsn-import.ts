import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";

// The file behind "Download HSN Directory in Excel Format" on the GST portal
// (Services > User Services > Search HSN Code).
export const GST_PORTAL_HSN_URL = "https://tutorial.gst.gov.in/downloads/HSN_SAC.xlsx";

export type HsnRow = { code: string; description: string; kind: "GOODS" | "SERVICE" };
export type ImportSummary = { goodsCount: number; servicesCount: number; skipped: number };

/**
 * Reads the GST portal workbook: sheet HSN_MSTR (HSN_CD, HSN_Description) and
 * SAC_MSTR (SAC_CD, SAC_Description). Codes that are not 2/4/6/8 digits are
 * skipped; a few rows in the official file have lost a leading zero.
 */
export async function parseHsnWorkbook(buffer: ArrayBuffer): Promise<{ rows: HsnRow[]; skipped: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const byCode = new Map<string, HsnRow>();
  let skipped = 0;
  let sheetsFound = 0;

  for (const ws of wb.worksheets) {
    const header = String(ws.getRow(1).getCell(1).value ?? "").trim().toUpperCase();
    const kind = header === "HSN_CD" ? "GOODS" : header === "SAC_CD" ? "SERVICE" : null;
    if (!kind) continue;
    sheetsFound++;

    ws.eachRow((row, i) => {
      if (i === 1) return;
      const code = cellText(row.getCell(1).value).replace(/\s/g, "");
      const description = cellText(row.getCell(2).value).replace(/\s+/g, " ").trim();
      if (!/^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(code) || !description) {
        if (code || description) skipped++;
        return;
      }
      byCode.set(code, { code, description, kind });
    });
  }

  if (sheetsFound === 0) throw new Error("This doesn't look like the GST portal HSN file (no HSN_CD / SAC_CD sheet).");
  if (byCode.size < 1000) throw new Error(`Only ${byCode.size} codes found; refusing to replace the HSN list.`);
  return { rows: [...byCode.values()], skipped };
}

/**
 * Lower-cased words separated by single spaces, with a leading and trailing
 * space, so searching for " fan" matches words starting with "fan" ("fans")
 * but not "infants".
 */
export function toSearchText(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v);
}

/** Replaces the HSN master with the rows from the workbook. */
export async function importHsnWorkbook(
  db: PrismaClient,
  buffer: ArrayBuffer,
  source: string,
  importedBy: string | null,
): Promise<ImportSummary> {
  const { rows, skipped } = await parseHsnWorkbook(buffer);
  const data = rows.map((r) => ({ ...r, searchText: toSearchText(`${r.code} ${r.description}`) }));

  await db.$transaction(async (tx) => {
    await tx.hsnCode.deleteMany();
    for (let i = 0; i < data.length; i += 1000) {
      await tx.hsnCode.createMany({ data: data.slice(i, i + 1000) });
    }
  }, { timeout: 120_000 });

  const summary = {
    goodsCount: rows.filter((r) => r.kind === "GOODS").length,
    servicesCount: rows.filter((r) => r.kind === "SERVICE").length,
    skipped,
  };
  await db.hsnImport.create({ data: { source, importedBy, ...summary } });
  return summary;
}

export async function downloadFromGstPortal(): Promise<ArrayBuffer> {
  const res = await fetch(GST_PORTAL_HSN_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GST portal returned HTTP ${res.status}`);
  return res.arrayBuffer();
}
