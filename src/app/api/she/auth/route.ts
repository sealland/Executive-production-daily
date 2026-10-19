import { jsonError, jsonOk } from "@/lib/api/http";
import {
  assertSheAuthBodyHeaders,
  assertSheAuthFieldLengths,
  assertSheImportOrigin,
  AUTH_FAIL_MESSAGE,
  authenticateSheUploader,
  ORIGIN_FAIL_MESSAGE,
  checkSheAuthCodeRateLimit,
  checkSheAuthRateLimit,
  clearSessionCookieHeader,
  clientIpFromRequest,
  sessionCookieHeader,
  sheAuthSecret,
  SheAuthError,
  signSheSessionToken
} from "@/lib/services/sheAuth";

// Fixed client texts per status: raw internal text is never sent back to the client.
const SAFE_MESSAGE_BY_STATUS: Record<number, string> = {
  401: AUTH_FAIL_MESSAGE,
  403: ORIGIN_FAIL_MESSAGE,
  411: "Content-Length header is required",
  413: "Request body too large"
};

function authErrorResponse(error: unknown) {
  if (error instanceof SheAuthError) {
    return jsonError(SAFE_MESSAGE_BY_STATUS[error.status] ?? AUTH_FAIL_MESSAGE, error.status);
  }
  // DB / INFO lookup failure: log the type only, never the emp code, PIN, or raw message.
  console.error("SHE auth failed:", error instanceof Error ? error.name : "non-Error");
  return jsonError("ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง", 503);
}

export async function POST(request: Request) {
  try {
    assertSheImportOrigin(request);

    const secret = sheAuthSecret();
    if (!secret) throw new SheAuthError(401, AUTH_FAIL_MESSAGE);

    if (!checkSheAuthRateLimit(clientIpFromRequest(request))) {
      throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
    }

    assertSheAuthBodyHeaders(request.headers);

    let body: { code?: unknown; pin?: unknown } | null;
    try {
      body = (await request.json()) as { code?: unknown; pin?: unknown } | null;
    } catch {
      throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
    }

    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!code || !pin) throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
    assertSheAuthFieldLengths(code, pin);

    if (!checkSheAuthCodeRateLimit(code)) throw new SheAuthError(401, AUTH_FAIL_MESSAGE);

    const empCode = await authenticateSheUploader(code, pin);
    const token = signSheSessionToken(empCode, secret);
    return jsonOk(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookieHeader(token)
        }
      }
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSheImportOrigin(request);
  } catch (error) {
    return authErrorResponse(error);
  }
  return jsonOk(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookieHeader()
      }
    }
  );
}
