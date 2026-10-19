import { jsonError, jsonOk } from "@/lib/api/http";
import { InvalidEmployeeError, requireEmployee } from "@/lib/services/employee";
import { assertSheImportEnabled, assertSheUploader } from "@/lib/services/sheDbLocal";
import {
  assertSheImportOrigin,
  requireSheUploadSession,
  SheAuthError
} from "@/lib/services/sheAuth";
import { importSheXlsxBuffer } from "@/lib/services/sheImport";

const MAX_BYTES = 10 * 1024 * 1024;

function importForbiddenStatus(message: string): number {
  if (message.includes("disabled") || message.includes("not allowed")) return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    assertSheImportEnabled();

    const session = requireSheUploadSession(request);
    const empCode = session.empCode;

    assertSheUploader(empCode);
    await requireEmployee(empCode);
    assertSheImportOrigin(request);

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
      return jsonError("Content-Length header is required", 411);
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength)) {
      return jsonError("Content-Length header is required", 411);
    }
    if (contentLength > MAX_BYTES) {
      return jsonError("File exceeds 10 MB limit", 413);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("file is required", 400);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return jsonError("Only .xlsx files are accepted", 400);
    }
    if (file.size > MAX_BYTES) return jsonError("File exceeds 10 MB limit", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importSheXlsxBuffer(buffer, file.name, empCode);

    return jsonOk({
      imported: result.imported,
      excludedCount: result.stats.excludedCount,
      excludedNos: result.stats.excludedNos,
      borderlineNos: result.stats.borderlineNos,
      skippedInvalidDate: result.stats.skippedInvalidDate,
      fileYear: result.fileYear
    });
  } catch (error) {
    if (error instanceof SheAuthError) {
      return jsonError(error.message, error.status);
    }
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    const message = error instanceof Error ? error.message : "Import failed";
    return jsonError(message, importForbiddenStatus(message), error);
  }
}
