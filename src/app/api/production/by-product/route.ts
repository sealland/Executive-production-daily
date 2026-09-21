import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getByProduct } from "@/lib/services/breakdowns";

export async function GET(request: Request) {
  try {
    const rows = await getByProduct(filtersFromRequest(request));
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลด Production by Product ไม่สำเร็จ", 500, error);
  }
}
