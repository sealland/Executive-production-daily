import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getDailyTrend } from "@/lib/services/trends";

export async function GET(request: Request) {
  try {
    const data = await getDailyTrend(filtersFromRequest(request));
    return jsonOk({ points: data });
  } catch (error) {
    return jsonError("โหลด Daily Trend ไม่สำเร็จ", 500, error);
  }
}
