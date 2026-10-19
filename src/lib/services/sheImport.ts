import { getCeoPool, sql } from "@/lib/db/ceo";
import { assertSheImportEnabled } from "@/lib/services/sheDbLocal";
import type { ParsedSheRow, SheParseResult } from "@/lib/services/sheXlsxParser";
import { assertXlsxBuffer, parseSheWorkbook } from "@/lib/services/sheXlsxParser";

export type SheImportResult = SheParseResult & {
  imported: number;
};

export function parseSheXlsxFile(buffer: Buffer, fileName: string): SheParseResult {
  assertXlsxBuffer(buffer, fileName);
  return parseSheWorkbook(buffer);
}

export async function importSheRows(
  rows: ParsedSheRow[],
  fileYear: number,
  importedBy: string
): Promise<number> {
  assertSheImportEnabled();
  const pool = await getCeoPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  let imported = 0;
  try {
    const del = new sql.Request(tx);
    del.input("y", sql.Int, fileYear);
    await del.query(`DELETE FROM dbo.tbl_she_incident_xls WHERE file_year = @y`);

    const batchSize = 40;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const req = new sql.Request(tx);
      const values: string[] = [];
      batch.forEach((row, idx) => {
        const p = `r${idx}`;
        req.input(`${p}no`, sql.Int, row.incidentNo);
        req.input(`${p}y`, sql.Int, row.fileYear || fileYear);
        req.input(`${p}d`, sql.Date, row.occurredDate);
        req.input(`${p}plant`, sql.NVarChar, row.plant);
        req.input(`${p}kpi`, sql.NVarChar, row.kpiCategory);
        req.input(`${p}type2`, sql.NVarChar, row.rawType2);
        req.input(`${p}incCat`, sql.NVarChar, row.incidentCategory);
        req.input(`${p}sev`, sql.NVarChar, row.severity);
        req.input(`${p}dept`, sql.NVarChar, row.department);
        req.input(`${p}detail`, sql.NVarChar, row.detailShort);
        req.input(`${p}by`, sql.NVarChar, importedBy);
        values.push(
          `(@${p}no, @${p}y, @${p}d, @${p}plant, @${p}kpi, @${p}type2, @${p}incCat, @${p}sev, @${p}dept, @${p}detail, @${p}by)`
        );
      });
      await req.query(`
        INSERT INTO dbo.tbl_she_incident_xls
          (incident_no, file_year, occurred_date, plant, kpi_category, raw_type2, incident_category, severity, department, detail_short, imported_by)
        VALUES ${values.join(", ")};
      `);
      imported += batch.length;
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  return imported;
}

export async function importSheXlsxBuffer(
  buffer: Buffer,
  fileName: string,
  importedBy: string
): Promise<SheImportResult> {
  const parsed = parseSheXlsxFile(buffer, fileName);
  if (parsed.rows.length === 0) {
    throw new Error(
      "ไม่พบแถวข้อมูลใน sheet DATA (หัวตาราง NO. / ข้อมูลว่าง) — ไม่ได้นำเข้า ข้อมูลเดิมไม่ถูกแก้ไข"
    );
  }
  const year = parsed.fileYear ?? parsed.rows[0]?.fileYear ?? new Date().getFullYear() + 543;
  const imported = await importSheRows(parsed.rows, year, importedBy);
  return { ...parsed, imported };
}
