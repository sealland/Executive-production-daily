import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysSince,
  isSheCardPlant,
  mapBranchToShePlant,
  plantStatus
} from "./sheStatus";

describe("sheStatus daysSince", () => {
  it("same calendar day is 0", () => {
    assert.equal(daysSince("2026-09-15", "2026-09-15"), 0);
  });

  it("counts across month and year boundaries", () => {
    assert.equal(daysSince("2026-09-01", "2026-10-01"), 30);
    assert.equal(daysSince("2025-12-31", "2026-01-01"), 1);
  });

  it("future incident date is negative", () => {
    assert.equal(daysSince("2026-09-20", "2026-09-15"), -5);
  });
});

describe("sheStatus plantStatus", () => {
  const asOf = "2026-09-15";

  it("missing byPlant row is gray", () => {
    assert.equal(plantStatus(false, null, null, null, null, asOf), "gray");
  });

  it("plant row with no injury history is green", () => {
    assert.equal(plantStatus(true, null, null, null, null, asOf), "green");
  });

  it("LTI exactly 30 days ago is red", () => {
    assert.equal(
      plantStatus(true, "2026-08-16", "LTI", "2026-08-16", "LTI", asOf),
      "red"
    );
  });

  it("TRI 31 days ago is green", () => {
    assert.equal(
      plantStatus(true, "2026-08-15", "TRI", "2026-08-15", "TRI", asOf),
      "green"
    );
  });

  it("First Aid 5 days ago is yellow when no recent LTI/TRI", () => {
    assert.equal(
      plantStatus(true, null, null, "2026-09-10", "First Aid", asOf),
      "yellow"
    );
  });

  it("29 days since injury is yellow; 30 days LTI still red", () => {
    assert.equal(
      plantStatus(true, null, null, "2026-08-17", "First Aid", asOf),
      "yellow"
    );
    assert.equal(
      plantStatus(true, "2026-08-16", "LTI", "2026-09-10", "First Aid", asOf),
      "red"
    );
  });
});

describe("sheStatus plant mapping", () => {
  it("maps known branches and rejects unknown for cards", () => {
    assert.equal(mapBranchToShePlant("MR7"), "RMD7");
    assert.equal(mapBranchToShePlant("MR8"), "RMD8");
    assert.equal(mapBranchToShePlant("MSM"), "MSM");
    assert.equal(mapBranchToShePlant("UNKNOWN"), "Other");
    assert.equal(isSheCardPlant("RMD7"), true);
    assert.equal(isSheCardPlant("Other"), false);
  });
});
