import { jsonError, jsonOk } from "@/lib/api/http";
import { getProductionLoss } from "@/lib/services/downtime";

export async function GET() {
  try {
    const rows = await getProductionLoss();
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลด Production Loss ไม่สำเร็จ", 500, error);
  }
}
