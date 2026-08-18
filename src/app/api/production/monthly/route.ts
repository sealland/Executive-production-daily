import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getMonthlyTrend } from "@/lib/services/trends";

export async function GET(request: Request) {
  try {
    const data = await getMonthlyTrend(filtersFromRequest(request));
    return jsonOk({ points: data });
  } catch (error) {
    return jsonError("โหลด Monthly Trend ไม่สำเร็จ", 500, error);
  }
}
