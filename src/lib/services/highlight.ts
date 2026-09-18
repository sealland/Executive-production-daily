import { getCeoPool, sql } from "@/lib/db/ceo";
import { requireEmployee } from "@/lib/services/employee";
import type { HighlightHistoryEntry, HighlightRecord } from "@/lib/types/production";

export { InvalidEmployeeError, lookupEmployee } from "@/lib/services/employee";

export async function getHighlight(reportDate: string, plant: string): Promise<HighlightRecord | null> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .input("plant", sql.NVarChar, plant)
    .query(`
      SELECT TOP 1 highlight_text, updated_by_code, updated_by_name, updated_by_position, updated_at
      FROM dbo.tbl_prd_highlight
      WHERE report_date = @d AND plant_code = @plant
    `);
  const row = result.recordset[0] as
    | {
        highlight_text: string;
        updated_by_code: string;
        updated_by_name: string | null;
        updated_by_position: string | null;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    reportDate,
    plant,
    text: row.highlight_text,
    updatedBy: { code: row.updated_by_code, name: row.updated_by_name || row.updated_by_code, position: row.updated_by_position },
    updatedAt: row.updated_at
  };
}

export async function saveHighlight(
  reportDate: string,
  plant: string,
  text: string,
  empCode: string
): Promise<HighlightRecord> {
  const employee = await requireEmployee(empCode);

  const pool = await getCeoPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const upsert = new sql.Request(tx);
    upsert
      .input("d", sql.Date, reportDate)
      .input("plant", sql.NVarChar, plant)
      .input("text", sql.NVarChar, text)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await upsert.query(`
      MERGE dbo.tbl_prd_highlight AS target
      USING (SELECT @d AS report_date, @plant AS plant_code) AS src
        ON target.report_date = src.report_date AND target.plant_code = src.plant_code
      WHEN MATCHED THEN
        UPDATE SET highlight_text = @text, updated_by_code = @code, updated_by_name = @name,
                   updated_by_position = @position, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (report_date, plant_code, highlight_text, updated_by_code, updated_by_name, updated_by_position, updated_at)
        VALUES (@d, @plant, @text, @code, @name, @position, SYSUTCDATETIME());
    `);

    const history = new sql.Request(tx);
    history
      .input("d", sql.Date, reportDate)
      .input("plant", sql.NVarChar, plant)
      .input("text", sql.NVarChar, text)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await history.query(`
      INSERT INTO dbo.tbl_prd_highlight_history
        (report_date, plant_code, highlight_text, edited_by_code, edited_by_name, edited_by_position, edited_at)
      VALUES (@d, @plant, @text, @code, @name, @position, SYSUTCDATETIME());
    `);

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const saved = await getHighlight(reportDate, plant);
  if (!saved) throw new Error("Failed to read back saved highlight");
  return saved;
}

export async function getHighlightHistory(reportDate: string, plant: string): Promise<HighlightHistoryEntry[]> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .input("plant", sql.NVarChar, plant)
    .query(`
      SELECT highlight_text, edited_by_code, edited_by_name, edited_by_position, edited_at
      FROM dbo.tbl_prd_highlight_history
      WHERE report_date = @d AND plant_code = @plant
      ORDER BY edited_at DESC
    `);
  return result.recordset.map((row: {
    highlight_text: string;
    edited_by_code: string;
    edited_by_name: string | null;
    edited_by_position: string | null;
    edited_at: string;
  }) => ({
    reportDate,
    plant,
    text: row.highlight_text,
    editedBy: { code: row.edited_by_code, name: row.edited_by_name || row.edited_by_code, position: row.edited_by_position },
    editedAt: row.edited_at
  }));
}
