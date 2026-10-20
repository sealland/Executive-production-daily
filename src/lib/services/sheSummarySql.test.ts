import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHE_BY_PLANT_SUMMARY_SQL } from "./sheSummary";

const FORBIDDEN =
  /OPENJSON|STRING_SPLIT|STRING_AGG|JSON_VALUE|JSON_QUERY|CONCAT_WS|AT TIME ZONE|TRIM\(|TRANSLATE/i;

describe("sheSummary SQL (SQL Server 2012)", () => {
  it("byPlant query avoids forbidden patterns and SELECT *", () => {
    assert.ok(!FORBIDDEN.test(SHE_BY_PLANT_SUMMARY_SQL));
    assert.ok(!/\bSELECT\s+\*/i.test(SHE_BY_PLANT_SUMMARY_SQL));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("@asOf"));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("@ytdStart"));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("@p1"));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("@p2"));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("@p3"));
    assert.ok(!/'\s*RMD7\s*'/.test(SHE_BY_PLANT_SUMMARY_SQL));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("LEFT(detail_short, 300)"));
    assert.ok(SHE_BY_PLANT_SUMMARY_SQL.includes("latest_detail_short"));
  });
});
