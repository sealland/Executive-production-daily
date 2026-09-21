import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getForecast } from "@/lib/services/trends";

export async function GET(request: Request) {
  try {
    const data = await getForecast(filtersFromRequest(request));
    return jsonOk(data);
  } catch (error) {
    return jsonError("โหลด Forecast ไม่สำเร็จ", 500, error);
  }
}
