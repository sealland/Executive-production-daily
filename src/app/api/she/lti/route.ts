import { jsonError, jsonOk } from "@/lib/api/http";
import { InvalidEmployeeError } from "@/lib/services/employee";
import { getLtiStatus, updateLtiDate } from "@/lib/services/she";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asOfDate = searchParams.get("asOfDate");
  if (!asOfDate) return jsonError("asOfDate is required", 400);

  try {
    const status = await getLtiStatus(asOfDate);
    return jsonOk({ status });
  } catch (error) {
    return jsonError("โหลดสถานะ Days without LTI ไม่สำเร็จ", 500, error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { lastLtiDate, empCode, asOfDate } = body as {
      lastLtiDate?: string;
      empCode?: string;
      asOfDate?: string;
    };
    if (!lastLtiDate || !empCode || !asOfDate) {
      return jsonError("lastLtiDate, empCode and asOfDate are required", 400);
    }
    const status = await updateLtiDate(lastLtiDate, empCode, asOfDate);
    return jsonOk({ status });
  } catch (error) {
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    return jsonError("บันทึก Days without LTI ไม่สำเร็จ", 500, error);
  }
}
