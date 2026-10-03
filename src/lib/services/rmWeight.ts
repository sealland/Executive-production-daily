import { getCeoPool, sql as ceoSql } from "@/lib/db/ceo";
import { getRmSourcePool, isRmSourceConfigured, sql, type RmPlant } from "@/lib/db/rmSources";

export interface RmWeightResult {
  plant: RmPlant;
  reportDate: string;
  rmWeightTon: number | null;
  /** RMD7/RMD8 only: FG bundle weight of the charges counted in rmWeightTon. null for MSM. */
  fgWeightTon: number | null;
  sourceNote: string | null;
}

// FG bundle tag table (one row per printed bundle tag), same name in both RMD7 and RMD8 DBs.
const RMD_FG_TAG_TABLE = "dbo.tbl_rmd_weight_line";

const ROLLING_MILL_NOTE = "tbl_rmd_weight_schedule x FG tags (per-charge yield)";
const MELT_SHOP_NOTE = "tbl_weight (melt shop weighbridge)";

/**
 * RMD7 / RMD8, per charge scheduled on the day that has FG bundle tags:
 *   billets used = ROUND(rmd_qty * actual bundles / rmd_bundle), capped at rmd_qty
 *                  (a charge still being rolled only counts the billets used so far)
 *   bl weight    = (billets used - rmd_defect) * rmd_weightbillet
 *   fg weight    = SUM(rmd_weight) of non-cancelled tags (rmd_tis_check <> 'X')
 * Yield = SUM(fg) / SUM(bl). Tags are matched on charge + date, because one charge
 * can be split across days/orders (e.g. 79909263 on 2026-09-30 and 2026-10-01).
 */
async function fetchRollingMill(plant: "RMD7" | "RMD8", reportDate: string): Promise<{ rmTon: number; fgTon: number }> {
  const pool = await getRmSourcePool(plant);
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      WITH tags AS (
        SELECT rmd_charge, COUNT(*) AS actual_bundle, SUM(ISNULL(rmd_weight, 0)) AS fg_kg
        FROM ${RMD_FG_TAG_TABLE}
        WHERE rmd_date >= @d AND rmd_date < DATEADD(day, 1, @d)
          AND ISNULL(rmd_tis_check, '') <> 'X'
        GROUP BY rmd_charge
      ),
      charges AS (
        SELECT
          t.fg_kg,
          ISNULL(s.rmd_weightbillet, 0) AS billet_kg,
          ISNULL(s.rmd_defect, 0) AS defect,
          CASE
            WHEN ISNULL(s.rmd_bundle, 0) <= 0 OR t.actual_bundle >= s.rmd_bundle THEN ISNULL(s.rmd_qty, 0)
            ELSE ROUND(s.rmd_qty * t.actual_bundle / CAST(s.rmd_bundle AS float), 0)
          END AS billets_used
        FROM dbo.tbl_rmd_weight_schedule s
        JOIN tags t ON t.rmd_charge = s.rmd_charge
        WHERE s.rmd_date >= @d AND s.rmd_date < DATEADD(day, 1, @d)
      )
      SELECT
        SUM(fg_kg) AS fgKg,
        SUM(CASE WHEN billets_used > defect THEN (billets_used - defect) * billet_kg ELSE 0 END) AS blKg
      FROM charges
    `);
  const row = result.recordset[0] as { fgKg: number | null; blKg: number | null } | undefined;
  return { rmTon: Number(row?.blKg || 0) / 1000, fgTon: Number(row?.fgKg || 0) / 1000 };
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

async function fetchRmFromSource(plant: RmPlant, reportDate: string): Promise<{ rmTon: number; fgTon: number | null }> {
  if (plant === "MSM") return { rmTon: await fetchMeltShopRm(reportDate), fgTon: null };
  return fetchRollingMill(plant, reportDate);
}

/** Pull RM weight for one plant/date from its source system and upsert into the staging table. */
export async function syncRmWeight(plant: RmPlant, reportDate: string): Promise<RmWeightResult> {
  if (!isRmSourceConfigured(plant)) {
    return { plant, reportDate, rmWeightTon: null, fgWeightTon: null, sourceNote: "source not configured" };
  }

  const { rmTon: rmWeightTon, fgTon: fgWeightTon } = await fetchRmFromSource(plant, reportDate);
  const sourceNote = plant === "MSM" ? MELT_SHOP_NOTE : ROLLING_MILL_NOTE;

  const pool = await getCeoPool();
  await pool
    .request()
    .input("d", ceoSql.Date, reportDate)
    .input("plant", ceoSql.NVarChar, plant)
    .input("ton", ceoSql.Float, rmWeightTon)
    .input("fg", ceoSql.Float, fgWeightTon)
    .input("note", ceoSql.NVarChar, sourceNote)
    .query(`
      MERGE dbo.tbl_prd_rm_weight AS target
      USING (SELECT @d AS report_date, @plant AS plant) AS src
        ON target.report_date = src.report_date AND target.plant = src.plant
      WHEN MATCHED THEN
        UPDATE SET rm_weight_ton = @ton, fg_weight_ton = @fg, source_note = @note, synced_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (report_date, plant, rm_weight_ton, fg_weight_ton, source_note, synced_at)
        VALUES (@d, @plant, @ton, @fg, @note, SYSUTCDATETIME());
    `);

  return { plant, reportDate, rmWeightTon, fgWeightTon, sourceNote };
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
        fgWeightTon: null,
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
      SELECT rm_weight_ton, fg_weight_ton, source_note
      FROM dbo.tbl_prd_rm_weight
      WHERE report_date = @d AND plant = @plant
    `);
  const row = result.recordset[0] as
    | { rm_weight_ton: number; fg_weight_ton: number | null; source_note: string | null }
    | undefined;
  if (!row) return null;
  return {
    plant,
    reportDate,
    rmWeightTon: row.rm_weight_ton,
    fgWeightTon: row.fg_weight_ton,
    sourceNote: row.source_note
  };
}
