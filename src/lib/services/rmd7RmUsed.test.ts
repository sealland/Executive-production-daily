import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RMD7_LINE_RM_FILTER_SQL,
  computeRmd7YieldPct,
  rmd7KgSumToRmWeightTon
} from "./rmd7RmUsed";

describe("rmd7KgSumToRmWeightTon", () => {
  it("16/10 tag-sum kg → 378.046 t", () => {
    assert.equal(rmd7KgSumToRmWeightTon(378046), 378.046);
  });
});

describe("RMD7_LINE_RM_FILTER_SQL", () => {
  it("excludes cancelled tags and non-positive weight in SQL", () => {
    assert.match(RMD7_LINE_RM_FILTER_SQL, /rmd_tis_check/);
    assert.match(RMD7_LINE_RM_FILTER_SQL, /<> 'X'/);
    assert.match(RMD7_LINE_RM_FILTER_SQL, /rmd_weight > 0/);
  });
});

describe("computeRmd7YieldPct", () => {
  it("16/10 acceptance: 366.302 / 378.046 → 96.9%", () => {
    assert.equal(computeRmd7YieldPct(366.302, 378.046), 96.9);
  });

  it("prd_a = 0 → null", () => {
    assert.equal(computeRmd7YieldPct(0, 378.046), null);
  });

  it("ΣRM = 0 or null → null", () => {
    assert.equal(computeRmd7YieldPct(366.302, 0), null);
    assert.equal(computeRmd7YieldPct(366.302, null), null);
  });

  it("yield > 100% is not clamped", () => {
    assert.equal(computeRmd7YieldPct(500, 400), 125);
  });
});
