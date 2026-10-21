import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usernameFromEngName } from "./username";

function assertUsername(input: string | null | undefined, expected: string | null) {
  const result = usernameFromEngName(input);
  assert.equal(result, expected);
  if (result) {
    assert.ok(!result.includes(".."), `must not contain "..": ${result}`);
    assert.ok(!result.startsWith("."), `must not start with ".": ${result}`);
    assert.ok(!result.endsWith("."), `must not end with ".": ${result}`);
  }
}

describe("usernameFromEngName", () => {
  it('MR. SIRICHAI  CHAYMANEE → sirichai.c', () => {
    assertUsername("MR. SIRICHAI  CHAYMANEE", "sirichai.c");
  });

  it("MR. Sirichai C.", () => {
    assertUsername("MR. Sirichai C.", "sirichai.c");
  });

  it("Mr.Sirichai Chxx (no space after title dot)", () => {
    assertUsername("Mr.Sirichai Chxx", "sirichai.c");
  });

  it("Miss Jutamat  Siwakun", () => {
    assertUsername("Miss Jutamat  Siwakun", "jutamat.s");
  });

  it("given names starting with a title word are not stripped", () => {
    assertUsername("Drew Smith", "drew.s");
    assertUsername("Mridul Patel", "mridul.p");
  });

  it("single name token", () => {
    assertUsername("Sirichai", "sirichai");
  });

  it("title only, no dots left behind", () => {
    assertUsername("MR.", "mr");
  });

  it("null and empty", () => {
    assert.equal(usernameFromEngName(null), null);
    assert.equal(usernameFromEngName(undefined), null);
    assert.equal(usernameFromEngName(""), null);
    assert.equal(usernameFromEngName("   "), null);
  });
});
