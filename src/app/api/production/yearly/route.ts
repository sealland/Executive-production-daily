import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getYearlyTrend } from "@/lib/services/trends";

export async function GET(request: Request) {
  try {
    const data = await getYearlyTrend(filtersFromRequest(request));
    return jsonOk({ points: data });
  } catch (error) {
    return jsonError("โหลด Yearly Trend ไม่สำเร็จ", 500, error);
  }
}
