import { jsonError, jsonOk } from "@/lib/api/http";
import { getRmWeight, syncRmWeightAllPlants } from "@/lib/services/rmWeight";
import { RM_PLANTS } from "@/lib/db/rmSources";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return jsonError("date is required", 400);

  try {
    const rows = await Promise.all(RM_PLANTS.map((plant) => getRmWeight(plant, date)));
    return jsonOk({ rows: rows.filter(Boolean) });
  } catch (error) {
    return jsonError("โหลดน้ำหนัก RM ไม่สำเร็จ", 500, error);
  }
}

/** Pulls fresh RM weight from each plant's own SQL Server and re-stages it in CEO_REPORT. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = (body as { date?: string }).date;
    if (!date) return jsonError("date is required", 400);
    const rows = await syncRmWeightAllPlants(date);
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("ซิงค์น้ำหนัก RM ไม่สำเร็จ", 500, error);
  }
}
