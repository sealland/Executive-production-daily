import { jsonError, jsonOk } from "@/lib/api/http";
import { getIncidentHistory } from "@/lib/services/she";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  const id = Number(idParam);
  if (!idParam || !Number.isFinite(id)) return jsonError("id is required", 400);

  try {
    const rows = await getIncidentHistory(id);
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลดประวัติรายการ SHE ไม่สำเร็จ", 500, error);
  }
}
