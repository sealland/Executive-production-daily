import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertSheAuthBodyHeaders,
  assertSheAuthFieldLengths,
  assertSheImportOrigin,
  authenticateSheUploader,
  checkSheAuthCodeRateLimit,
  checkSheAuthRateLimit,
  clearSessionCookieHeader,
  clientIpFromRequest,
  formatShePinHash,
  resetSheAuthRateLimitForTests,
  SheAuthError,
  sheAuthSecret,
  signSheSessionToken,
  verifySheSessionToken,
  verifySheUploadPin
} from "./sheAuth";

const TEST_SECRET = "01234567890123456789012345678901";

describe("sheAuth session token", () => {
  it("treats missing or short SHE_AUTH_SECRET as no secret", () => {
    const prev = process.env.SHE_AUTH_SECRET;
    process.env.SHE_AUTH_SECRET = "";
    assert.equal(sheAuthSecret(), null);
    process.env.SHE_AUTH_SECRET = "short";
    assert.equal(sheAuthSecret(), null);
    if (prev !== undefined) process.env.SHE_AUTH_SECRET = prev;
    else delete process.env.SHE_AUTH_SECRET;
  });

  it("accepts a valid token", () => {
    const token = signSheSessionToken("E001", TEST_SECRET, 1_000_000);
    const session = verifySheSessionToken(token, TEST_SECRET, 1_000_000);
    assert.ok(session);
    assert.equal(session.empCode, "E001");
  });

  it("rejects tampered signature", () => {
    const token = signSheSessionToken("E001", TEST_SECRET, 1_000_000);
    const [payload, sig] = token.split(".");
    const sigBuf = Buffer.from(sig, "base64url");
    sigBuf[0] ^= 0xff;
    const tampered = `${payload}.${sigBuf.toString("base64url")}`;
    assert.equal(verifySheSessionToken(tampered, TEST_SECRET, 1_000_000), null);
  });

  it("rejects expired token", () => {
    const token = signSheSessionToken("E001", TEST_SECRET, 1_000_000);
    assert.equal(verifySheSessionToken(token, TEST_SECRET, 1_000_000 + 8 * 60 * 60 * 1000 + 1), null);
  });

  it("rejects when secret missing or wrong", () => {
    const token = signSheSessionToken("E001", TEST_SECRET, 1_000_000);
    assert.equal(verifySheSessionToken(token, "wrong-secret-wrong-secret-wrong!!", 1_000_000), null);
  });

  it("logout cookie clears with Max-Age=0 and the same Path and flags", () => {
    const cookie = clearSessionCookieHeader();
    assert.match(cookie, /^she_upload_session=;/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /Path=\/api\/she/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });
});

describe("sheAuth PIN hash", () => {
  it("verifies scrypt hash", () => {
    const stored = formatShePinHash("test-pin-123");
    assert.equal(verifySheUploadPin("test-pin-123", stored), true);
    assert.equal(verifySheUploadPin("wrong", stored), false);
  });
});

describe("sheAuth uploader allowlist", () => {
  const prevSecret = process.env.SHE_AUTH_SECRET;
  const prevUsers = process.env.SHE_UPLOAD_USERS;

  afterEach(() => {
    if (prevSecret !== undefined) process.env.SHE_AUTH_SECRET = prevSecret;
    else delete process.env.SHE_AUTH_SECRET;
    if (prevUsers !== undefined) process.env.SHE_UPLOAD_USERS = prevUsers;
    else delete process.env.SHE_UPLOAD_USERS;
  });

  it("fails when the code is not in SHE_UPLOAD_USERS (no DB lookup reached)", async () => {
    process.env.SHE_AUTH_SECRET = TEST_SECRET;
    process.env.SHE_UPLOAD_USERS = `E001:${formatShePinHash("pin-one")}`;
    await assert.rejects(
      () => authenticateSheUploader("E999", "pin-one"),
      (error: unknown) => error instanceof SheAuthError && error.status === 401
    );
  });
});

describe("sheAuth rate limit", () => {
  afterEach(() => {
    resetSheAuthRateLimitForTests();
  });

  it("allows up to 5 attempts per minute then blocks", () => {
    const ip = "203.0.113.10";
    const now = 5_000_000;
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkSheAuthRateLimit(ip, now + i), true);
    }
    assert.equal(checkSheAuthRateLimit(ip, now + 10), false);
  });

  it("limits per emp code independently of IP", () => {
    const now = 7_000_000;
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkSheAuthCodeRateLimit("E001", now + i), true);
    }
    assert.equal(checkSheAuthCodeRateLimit("E001", now + 10), false);
    assert.equal(checkSheAuthCodeRateLimit("E002", now + 10), true);
  });
});

describe("sheAuth client IP", () => {
  it("uses the right-most X-Forwarded-For entry (appended by Traefik), not the spoofable left-most", () => {
    const req = new Request("https://app.example/api/she/auth", {
      method: "POST",
      headers: { "X-Forwarded-For": "1.1.1.1, 5.6.7.8" }
    });
    assert.equal(clientIpFromRequest(req), "5.6.7.8");
  });

  it("falls back to X-Real-IP, then unknown", () => {
    const real = new Request("https://app.example/api/she/auth", {
      method: "POST",
      headers: { "X-Real-IP": "9.9.9.9" }
    });
    assert.equal(clientIpFromRequest(real), "9.9.9.9");
    const none = new Request("https://app.example/api/she/auth", { method: "POST" });
    assert.equal(clientIpFromRequest(none), "unknown");
  });
});

describe("sheAuth body and field caps", () => {
  it("rejects missing Content-Length with 411", () => {
    assert.throws(
      () => assertSheAuthBodyHeaders(new Headers()),
      (error: unknown) => error instanceof SheAuthError && error.status === 411
    );
  });

  it("rejects Content-Length over 4 KB with 413, accepts 4 KB", () => {
    assert.throws(
      () => assertSheAuthBodyHeaders(new Headers({ "Content-Length": "4097" })),
      (error: unknown) => error instanceof SheAuthError && error.status === 413
    );
    assertSheAuthBodyHeaders(new Headers({ "Content-Length": "4096" }));
  });

  it("rejects code or PIN longer than 64 chars, accepts 64", () => {
    const long = "x".repeat(65);
    assert.throws(
      () => assertSheAuthFieldLengths(long, "pin"),
      (error: unknown) => error instanceof SheAuthError && error.status === 401
    );
    assert.throws(() => assertSheAuthFieldLengths("E001", long), SheAuthError);
    assertSheAuthFieldLengths("x".repeat(64), "y".repeat(64));
  });
});

describe("sheAuth Origin", () => {
  it("rejects missing Origin", () => {
    const req = new Request("https://app.example/api/she/import", {
      method: "POST",
      headers: { Host: "app.example" }
    });
    assert.throws(() => assertSheImportOrigin(req), /Origin/);
  });

  it("rejects mismatch", () => {
    const req = new Request("https://app.example/api/she/import", {
      method: "POST",
      headers: { Origin: "https://evil.example", Host: "app.example" }
    });
    assert.throws(() => assertSheImportOrigin(req), /Origin/);
  });

  it("accepts matching origin", () => {
    const req = new Request("https://app.example/api/she/import", {
      method: "POST",
      headers: { Origin: "https://app.example", Host: "app.example" }
    });
    assertSheImportOrigin(req);
  });
});
