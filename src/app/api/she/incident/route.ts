import { jsonError, jsonOk } from "@/lib/api/http";
import { InvalidEmployeeError } from "@/lib/services/employee";
import { createIncident, listIncidents } from "@/lib/services/she";
import type { IncidentStatus } from "@/lib/types/she";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return jsonError("date is required", 400);

  try {
    const rows = await listIncidents(date);
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลดรายการ SHE ไม่สำเร็จ", 500, error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reportDate, plant, title, description, location, occurredTime, status, empCode } = body as {
      reportDate?: string;
      plant?: string | null;
      title?: string;
      description?: string | null;
      location?: string | null;
      occurredTime?: string | null;
      status?: IncidentStatus;
      empCode?: string;
    };
    if (!reportDate || !title || !empCode) {
      return jsonError("reportDate, title and empCode are required", 400);
    }
    const incident = await createIncident(
      {
        reportDate,
        plant: plant || null,
        title,
        description: description || null,
        location: location || null,
        occurredTime: occurredTime || null,
        status: status === "resolved" ? "resolved" : "monitoring"
      },
      empCode
    );
    return jsonOk({ incident });
  } catch (error) {
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    return jsonError("บันทึกรายการ SHE ไม่สำเร็จ", 500, error);
  }
}
