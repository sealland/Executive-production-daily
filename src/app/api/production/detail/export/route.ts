import { filtersFromRequest, jsonError } from "@/lib/api/http";
import { exportDetailExcel } from "@/lib/services/detail";

export async function GET(request: Request) {
  try {
    const buffer = await exportDetailExcel(filtersFromRequest(request));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="production-detail.xlsx"'
      }
    });
  } catch (error) {
    return jsonError("Export ไม่สำเร็จ", 500, error);
  }
}
