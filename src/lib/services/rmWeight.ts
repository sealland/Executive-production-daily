import { getCeoPool, sql as ceoSql } from "@/lib/db/ceo";
import { getRmSourcePool, isRmSourceConfigured, sql, type RmPlant } from "@/lib/db/rmSources";

export interface RmWeightResult {
  plant: RmPlant;
  reportDate: string;
  rmWeightTon: number | null;
  sourceNote: string | null;
}

/**
 * RMD7 / RMD8: RM = billets charged into the rolling mill that day.
 * qty * weight-per-billet (kg), from the plant's own tbl_rmd_weight_schedule.
 */
async function fetchRollingMillRm(plant: "RMD7" | "RMD8", reportDate: string): Promise<number> {
  const pool = await getRmSourcePool(plant);
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT SUM(ISNULL(rmd_qty, 0) * ISNULL(rmd_weightbillet, 0)) AS totalKg
      FROM dbo.tbl_rmd_weight_schedule
      WHERE CONVERT(date, rmd_date) = @d
    `);
  const kg = Number(result.recordset[0]?.totalKg || 0);
  return kg / 1000;
}

/**
 * MSM: RM = scrap charged into the melting furnace that day, from the weighbridge log.
 */
async function fetchMeltShopRm(reportDate: string): Promise<number> {
  const pool = await getRmSourcePool("MSM");
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT SUM(ISNULL(we_weight_net, 0)) AS totalKg
      FROM dbo.tbl_weight
      WHERE CONVERT(date, we_date) = @d
    `);
  const kg = Number(result.recordset[0]?.totalKg || 0);
  return kg / 1000;
}

async function fetchRmFromSource(plant: RmPlant, reportDate: string): Promise<number> {
  if (plant === "MSM") return fetchMeltShopRm(reportDate);
  return fetchRollingMillRm(plant, reportDate);
}

/** Pull RM weight for one plant/date from its source system and upsert into the staging table. */
export async function syncRmWeight(plant: RmPlant, reportDate: string): Promise<RmWeightResult> {
  if (!isRmSourceConfigured(plant)) {
    return { plant, reportDate, rmWeightTon: null, sourceNote: "source not configured" };
  }

  const rmWeightTon = await fetchRmFromSource(plant, reportDate);
  const sourceNote =
    plant === "MSM" ? "tbl_weight (melt shop weighbridge)" : "tbl_rmd_weight_schedule (billet charge)";

  const pool = await getCeoPool();
  await pool
    .request()
    .input("d", ceoSql.Date, reportDate)
    .input("plant", ceoSql.NVarChar, plant)
    .input("ton", ceoSql.Float, rmWeightTon)
    .input("note", ceoSql.NVarChar, sourceNote)
    .query(`
      MERGE dbo.tbl_prd_rm_weight AS target
      USING (SELECT @d AS report_date, @plant AS plant) AS src
        ON target.report_date = src.report_date AND target.plant = src.plant
      WHEN MATCHED THEN
        UPDATE SET rm_weight_ton = @ton, source_note = @note, synced_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (report_date, plant, rm_weight_ton, source_note, synced_at)
        VALUES (@d, @plant, @ton, @note, SYSUTCDATETIME());
    `);

  return { plant, reportDate, rmWeightTon, sourceNote };
}

export async function syncRmWeightAllPlants(reportDate: string): Promise<RmWeightResult[]> {
  const plants: RmPlant[] = ["RMD7", "RMD8", "MSM"];
  const results: RmWeightResult[] = [];
  for (const plant of plants) {
    try {
      results.push(await syncRmWeight(plant, reportDate));
    } catch (error) {
      results.push({
        plant,
        reportDate,
        rmWeightTon: null,
        sourceNote: error instanceof Error ? error.message : "sync failed"
      });
    }
  }
  return results;
}

export async function getRmWeight(plant: RmPlant, reportDate: string): Promise<RmWeightResult | null> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("d", ceoSql.Date, reportDate)
    .input("plant", ceoSql.NVarChar, plant)
    .query(`
      SELECT rm_weight_ton, source_note
      FROM dbo.tbl_prd_rm_weight
      WHERE report_date = @d AND plant = @plant
    `);
  const row = result.recordset[0] as { rm_weight_ton: number; source_note: string | null } | undefined;
  if (!row) return null;
  return { plant, reportDate, rmWeightTon: row.rm_weight_ton, sourceNote: row.source_note };
}
