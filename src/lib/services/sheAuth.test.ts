import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertSheAuthBodyHeaders,
  assertSheAuthFieldLengths,
  assertSheImportOrigin,
  authenticateSheUploader,
  authorizeSheImportFromRequest,
  checkSheAuthCodeRateLimit,
  checkSheAuthRateLimit,
  clearSessionCookieHeader,
  clientIpFromRequest,
  formatShePinHash,
  normalizeSheCurrentUser,
  resetSheAuthRateLimitForTests,
  resolveSheImportEmpCode,
  SHE_IMPORT_FORBIDDEN_MESSAGE,
  SHE_IMPORT_MISSING_USER_MESSAGE,
  SheAuthError,
  sheAuthSecret,
  sheUploadCanUpload,
  signSheSessionToken,
  verifySheSessionToken,
  verifySheUploadPin
} from "./sheAuth";
import { GET as sheEligibilityGet } from "../../app/api/she/auth/eligibility/route";

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

describe("sheAuth currentUser upload (v0.6.0)", () => {
  const prevEmpcodes = process.env.SHE_UPLOAD_EMPCODES;

  afterEach(() => {
    resetSheAuthRateLimitForTests();
    if (prevEmpcodes !== undefined) process.env.SHE_UPLOAD_EMPCODES = prevEmpcodes;
    else delete process.env.SHE_UPLOAD_EMPCODES;
  });

  it("normalizeSheCurrentUser trims and caps length at 64", () => {
    assert.equal(normalizeSheCurrentUser("  TEST0001  "), "TEST0001");
    assert.equal(normalizeSheCurrentUser(""), null);
    assert.equal(normalizeSheCurrentUser("x".repeat(65)), null);
  });

  it("sheUploadCanUpload is true only for allowlisted codes", () => {
    process.env.SHE_UPLOAD_EMPCODES = "TEST0001,TEST0002";
    assert.equal(sheUploadCanUpload("TEST0001"), true);
    assert.equal(sheUploadCanUpload("TEST9999"), false);
  });

  it("eligibility GET returns only canUpload with no-store", async () => {
    process.env.SHE_UPLOAD_EMPCODES = "TEST0001";
    const allowed = await sheEligibilityGet(
      new Request("https://app.example/api/she/auth/eligibility?currentUser=TEST0001")
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("Cache-Control"), "no-store");
    const allowedBody = (await allowed.json()) as { canUpload: boolean };
    assert.equal(Object.keys(allowedBody).length, 1);
    assert.equal(allowedBody.canUpload, true);

    const denied = await sheEligibilityGet(
      new Request("https://app.example/api/she/auth/eligibility?currentUser=TEST9999")
    );
    const deniedBody = (await denied.json()) as { canUpload: boolean };
    assert.equal(deniedBody.canUpload, false);
  });

  it("eligibility GET returns 429 when rate limit exceeded", async () => {
    process.env.SHE_UPLOAD_EMPCODES = "TEST0001";
    const ip = "203.0.113.55";
    let lastStatus = 200;
    for (let i = 0; i < 6; i += 1) {
      const res = await sheEligibilityGet(
        new Request("https://app.example/api/she/auth/eligibility?currentUser=TEST0001", {
          headers: { "X-Real-IP": ip }
        })
      );
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429);
    const limited = await sheEligibilityGet(
      new Request("https://app.example/api/she/auth/eligibility?currentUser=TEST0001", {
        headers: { "X-Real-IP": ip }
      })
    );
    const body = (await limited.json()) as { canUpload: boolean };
    assert.equal(body.canUpload, false);
  });

  it("authorizeSheImportFromRequest returns 401 without currentUser", async () => {
    await assert.rejects(
      () => authorizeSheImportFromRequest(new Request("https://app.example/api/she/import", { method: "POST" })),
      (error: unknown) =>
        error instanceof SheAuthError &&
        error.status === 401 &&
        error.message === SHE_IMPORT_MISSING_USER_MESSAGE
    );
  });

  it("authorizeSheImportFromRequest returns 403 for code not in allowlist before any DB lookup", async () => {
    // If lookupEmployee were reached, getCeoPool would fail with a non-SheAuthError (no DB in tests).
    process.env.SHE_UPLOAD_EMPCODES = "TEST0001";
    await assert.rejects(
      () =>
        authorizeSheImportFromRequest(
          new Request("https://app.example/api/she/import?currentUser=TEST9999", { method: "POST" })
        ),
      (error: unknown) =>
        error instanceof SheAuthError &&
        error.status === 403 &&
        error.message === SHE_IMPORT_FORBIDDEN_MESSAGE
    );
    delete process.env.SHE_UPLOAD_EMPCODES;
  });

  it("resolveSheImportEmpCode returns 403 for allowlist and inactive with same message", () => {
    process.env.SHE_UPLOAD_EMPCODES = "TEST0001";
    assert.throws(
      () => resolveSheImportEmpCode("TEST9999", { code: "TEST9999", name: "X", position: null, username: null }),
      (error: unknown) =>
        error instanceof SheAuthError &&
        error.status === 403 &&
        error.message === SHE_IMPORT_FORBIDDEN_MESSAGE
    );
    assert.throws(
      () => resolveSheImportEmpCode("TEST0001", null),
      (error: unknown) =>
        error instanceof SheAuthError &&
        error.status === 403 &&
        error.message === SHE_IMPORT_FORBIDDEN_MESSAGE
    );
    assert.equal(
      resolveSheImportEmpCode("TEST0001", {
        code: "TEST0001",
        name: "Test",
        position: null,
        username: null
      }),
      "TEST0001"
    );
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
