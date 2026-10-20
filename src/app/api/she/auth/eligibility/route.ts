import { jsonOk } from "@/lib/api/http";
import {
  checkSheAuthCodeRateLimit,
  checkSheAuthRateLimit,
  clientIpFromRequest,
  normalizeSheCurrentUser,
  sheUploadCanUpload
} from "@/lib/services/sheAuth";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const now = Date.now();
  const ip = clientIpFromRequest(request);
  if (!checkSheAuthRateLimit(ip, now)) {
    return jsonOk({ canUpload: false }, { status: 429, headers: NO_STORE });
  }

  const code = normalizeSheCurrentUser(new URL(request.url).searchParams.get("currentUser"));
  if (code && !checkSheAuthCodeRateLimit(code, now)) {
    return jsonOk({ canUpload: false }, { status: 429, headers: NO_STORE });
  }

  const canUpload = code ? sheUploadCanUpload(code) : false;
  return jsonOk({ canUpload }, { headers: NO_STORE });
}
