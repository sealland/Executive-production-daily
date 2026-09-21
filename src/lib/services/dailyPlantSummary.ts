import { getCeoPool, sql } from "@/lib/db/ceo";
import { getRmWeight } from "@/lib/services/rmWeight";
import { RM_PLANTS, type RmPlant } from "@/lib/db/rmSources";

export interface DailyPlantSummary {
  plant: RmPlant; // RMD7 | RMD8 | MSM
  reportDate: string;
  targetTon: number;
  actualTon: number;
  achievementPct: number | null;
  rmWeightTon: number | null;
  yieldPct: number | null;
}

// tbl_prd_summary_new stores this plant's rows under prd_plant = 'SMD', not 'MSM'.
const PROD_PLANT_CODE: Record<RmPlant, string> = { RMD7: "RMD7", RMD8: "RMD8", MSM: "SMD" };

export async function getDailyPlantSummary(reportDate: string): Promise<DailyPlantSummary[]> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT
        prd_plant AS plant,
        SUM(ISNULL(prd_a, 0)) AS actualTon,
        SUM(ISNULL(TRY_CONVERT(float, prd_goal), 0)) AS targetTon
      FROM dbo.tbl_prd_summary_new
      WHERE prd_plant IN ('RMD7', 'RMD8', 'SMD')
        AND prd_date = @d
      GROUP BY prd_plant
    `);

  const byProdPlant = new Map<string, { actualTon: number; targetTon: number }>();
  for (const row of result.recordset as Array<{ plant: string; actualTon: number; targetTon: number }>) {
    byProdPlant.set(row.plant, { actualTon: Number(row.actualTon || 0), targetTon: Number(row.targetTon || 0) });
  }

  const rmRows = await Promise.all(RM_PLANTS.map((plant) => getRmWeight(plant, reportDate)));
  const rmByPlant = new Map(rmRows.filter(Boolean).map((r) => [r!.plant, r!.rmWeightTon]));

  return RM_PLANTS.map((plant) => {
    const prod = byProdPlant.get(PROD_PLANT_CODE[plant]) || { actualTon: 0, targetTon: 0 };
    const rmWeightTon = rmByPlant.get(plant) ?? null;
    const achievementPct = prod.targetTon > 0 ? (prod.actualTon / prod.targetTon) * 100 : null;
    const yieldPct = rmWeightTon && rmWeightTon > 0 ? (prod.actualTon / rmWeightTon) * 100 : null;
    return {
      plant,
      reportDate,
      targetTon: prod.targetTon,
      actualTon: prod.actualTon,
      achievementPct,
      rmWeightTon,
      yieldPct
    };
  });
}
