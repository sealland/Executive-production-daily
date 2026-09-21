import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getFilterOptions } from "@/lib/services/summary";

export async function GET(request: Request) {
  try {
    const filters = filtersFromRequest(request);
    const options = await getFilterOptions(filters);
    return jsonOk(options);
  } catch (error) {
    return jsonError("โหลดตัวเลือก Filter ไม่สำเร็จ", 500, error);
  }
}
