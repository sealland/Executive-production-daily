import { jsonError, jsonOk } from "@/lib/api/http";
import { getDailyPlantSummary } from "@/lib/services/dailyPlantSummary";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return jsonError("date is required", 400);

  try {
    const rows = await getDailyPlantSummary(date);
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลด Daily Plant Summary ไม่สำเร็จ", 500, error);
  }
}
