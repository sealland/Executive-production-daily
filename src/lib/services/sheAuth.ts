import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { lookupEmployee } from "@/lib/services/employee";
import { assertSheUploader } from "@/lib/services/sheDbLocal";

export const SHE_SESSION_COOKIE = "she_upload_session";
export const SHE_SESSION_MAX_AGE_SEC = 8 * 60 * 60;
const SCRYPT_KEYLEN = 32;

export const AUTH_FAIL_MESSAGE = "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง";
export const ORIGIN_FAIL_MESSAGE = "คำขอไม่ได้รับอนุญาต (Origin)";

type RateBucket = { count: number; windowStart: number };
const authRateByIp = new Map<string, RateBucket>();
const authRateByCode = new Map<string, RateBucket>();
const AUTH_RATE_MAX_KEYS = 1000;
const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_MAX_ATTEMPTS = 5;
export const SHE_AUTH_MAX_BODY_BYTES = 4 * 1024;
export const SHE_AUTH_MAX_FIELD_CHARS = 64;

export class SheAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SheAuthError";
    this.status = status;
  }
}

export function sheAuthSecret(): string | null {
  const raw = (process.env.SHE_AUTH_SECRET || "").trim();
  if (raw.length < 32) return null;
  return raw;
}

export function sheCookieSecure(): boolean {
  const raw = (process.env.SHE_COOKIE_SECURE || "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64UrlDecode(s: string): Buffer | null {
  try {
    return Buffer.from(s, "base64url");
  } catch {
    return null;
  }
}

export function signSheSessionToken(empCode: string, secret: string, nowMs = Date.now()): string {
  const exp = nowMs + SHE_SESSION_MAX_AGE_SEC * 1000;
  const payload = `${empCode.trim()}|${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest();
  return `${base64UrlEncode(Buffer.from(payload, "utf8"))}.${base64UrlEncode(sig)}`;
}

export type VerifiedSheSession = { empCode: string; exp: number };

export function verifySheSessionToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): VerifiedSheSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadBuf = base64UrlDecode(parts[0]);
  const sigBuf = base64UrlDecode(parts[1]);
  if (!payloadBuf || !sigBuf) return null;
  const payload = payloadBuf.toString("utf8");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null;
  const sep = payload.lastIndexOf("|");
  if (sep < 0) return null;
  const empCode = payload.slice(0, sep).trim();
  const exp = Number(payload.slice(sep + 1));
  if (!empCode || !Number.isFinite(exp) || exp <= nowMs) return null;
  return { empCode, exp };
}

export function parseSheUploadUsers(): Map<string, string> {
  const raw = (process.env.SHE_UPLOAD_USERS || "").trim();
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const colon = piece.indexOf(":");
    if (colon <= 0) continue;
    const code = piece.slice(0, colon).trim();
    const hash = piece.slice(colon + 1).trim();
    if (code && hash) map.set(code, hash);
  }
  return map;
}

export function verifySheUploadPin(pin: string, stored: string): boolean {
  const dot = stored.indexOf(".");
  if (dot <= 0) return false;
  const salt = base64UrlDecode(stored.slice(0, dot));
  const expected = base64UrlDecode(stored.slice(dot + 1));
  if (!salt || !expected || expected.length !== SCRYPT_KEYLEN) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(pin, salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function evictAuthRateLimit(map: Map<string, RateBucket>, now: number): void {
  if (map.size <= AUTH_RATE_MAX_KEYS) return;
  for (const [key, bucket] of map) {
    if (now - bucket.windowStart >= AUTH_RATE_WINDOW_MS) map.delete(key);
    if (map.size <= AUTH_RATE_MAX_KEYS) break;
  }
  // shortcut: if still over cap, drop oldest-inserted keys (best-effort, not strict LRU)
  while (map.size > AUTH_RATE_MAX_KEYS) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

function hitAuthRateBucket(map: Map<string, RateBucket>, key: string, now: number): boolean {
  evictAuthRateLimit(map, now);
  let bucket = map.get(key);
  if (!bucket || now - bucket.windowStart >= AUTH_RATE_WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    map.set(key, bucket);
  }
  if (bucket.count >= AUTH_RATE_MAX_ATTEMPTS) return false;
  bucket.count += 1;
  return true;
}

/** Per client IP: 5 attempts per minute. */
export function checkSheAuthRateLimit(clientIp: string, now = Date.now()): boolean {
  return hitAuthRateBucket(authRateByIp, clientIp.trim() || "unknown", now);
}

/** Per emp code: 5 attempts per minute, regardless of IP. */
export function checkSheAuthCodeRateLimit(code: string, now = Date.now()): boolean {
  return hitAuthRateBucket(authRateByCode, code.trim() || "unknown", now);
}

/** Reset rate limit state (tests only). */
export function resetSheAuthRateLimitForTests(): void {
  authRateByIp.clear();
  authRateByCode.clear();
}

export function clientIpFromRequest(request: Request): string {
  // Traefik appends the real client IP as the right-most XFF entry; left-most entries are client-controlled.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (last) return last;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Throws 411/413 unless Content-Length is present and within SHE_AUTH_MAX_BODY_BYTES. */
export function assertSheAuthBodyHeaders(headers: Headers): void {
  const raw = headers.get("content-length");
  if (raw == null || raw.trim() === "") {
    throw new SheAuthError(411, "Content-Length header is required");
  }
  const len = Number(raw);
  if (!Number.isFinite(len) || len < 0) {
    throw new SheAuthError(411, "Content-Length header is required");
  }
  if (len > SHE_AUTH_MAX_BODY_BYTES) {
    throw new SheAuthError(413, "Request body too large");
  }
}

/** Code/PIN longer than the cap fail with the same generic auth message (no detail leaked). */
export function assertSheAuthFieldLengths(code: string, pin: string): void {
  if (code.length > SHE_AUTH_MAX_FIELD_CHARS || pin.length > SHE_AUTH_MAX_FIELD_CHARS) {
    throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
  }
}

export function expectedAppOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "") ||
    "http";
  return `${proto}://${host}`;
}

export function assertSheImportOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new SheAuthError(403, ORIGIN_FAIL_MESSAGE);
  }
  const expected = expectedAppOrigin(request);
  const a = Buffer.from(origin);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new SheAuthError(403, ORIGIN_FAIL_MESSAGE);
  }
}

function buildSheSessionCookie(value: string, maxAgeSec: number): string {
  const parts = [
    `${SHE_SESSION_COOKIE}=${value}`,
    "Path=/api/she",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`
  ];
  if (sheCookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookieHeader(token: string): string {
  return buildSheSessionCookie(encodeURIComponent(token), SHE_SESSION_MAX_AGE_SEC);
}

/** Logout: same name/Path/flags as the login cookie, Max-Age=0. */
export function clearSessionCookieHeader(): string {
  return buildSheSessionCookie("", 0);
}

export function readSheSessionToken(request: Request): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  const prefix = `${SHE_SESSION_COOKIE}=`;
  for (const segment of raw.split(";")) {
    const piece = segment.trim();
    if (piece.startsWith(prefix)) {
      try {
        return decodeURIComponent(piece.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function requireSheUploadSession(request: Request): VerifiedSheSession {
  const secret = sheAuthSecret();
  if (!secret) {
    throw new SheAuthError(401, "ต้องเข้าสู่ระบบก่อนอัปโหลด");
  }
  const token = readSheSessionToken(request);
  if (!token) {
    throw new SheAuthError(401, "ต้องเข้าสู่ระบบก่อนอัปโหลด");
  }
  const session = verifySheSessionToken(token, secret);
  if (!session) {
    throw new SheAuthError(401, "ต้องเข้าสู่ระบบก่อนอัปโหลด");
  }
  return session;
}

export async function authenticateSheUploader(code: string, pin: string): Promise<string> {
  const secret = sheAuthSecret();
  if (!secret) {
    throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
  }
  const normalized = code.trim();
  const users = parseSheUploadUsers();
  const stored = users.get(normalized);
  if (!stored || !verifySheUploadPin(pin, stored)) {
    throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
  }
  try {
    assertSheUploader(normalized);
  } catch {
    throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
  }
  const employee = await lookupEmployee(normalized);
  if (!employee) {
    throw new SheAuthError(401, AUTH_FAIL_MESSAGE);
  }
  return employee.code;
}

export function formatShePinHash(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${base64UrlEncode(salt)}.${base64UrlEncode(hash)}`;
}
