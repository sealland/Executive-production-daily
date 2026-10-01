import { jsonError, jsonOk } from "@/lib/api/http";
import { getLtiHistory } from "@/lib/services/she";

export async function GET() {
  try {
    const rows = await getLtiHistory();
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลดประวัติ LTI ไม่สำเร็จ", 500, error);
  }
}
