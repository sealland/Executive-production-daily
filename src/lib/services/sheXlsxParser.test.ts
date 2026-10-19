import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseSheWorkbook, thaiDateToIso } from "./sheXlsxParser";

describe("thaiDateToIso", () => {
  it("converts BE date to CE ISO", () => {
    assert.equal(thaiDateToIso(15, "กันยายน", 2569), "2026-09-15");
  });

  it("returns null for invalid day", () => {
    assert.equal(thaiDateToIso(32, "มกราคม", 2569), null);
  });
});

describe("parseSheWorkbook", () => {
  it("parses DATA sheet, skips PII name column, counts PD, hides unmapped LI", () => {
    const header = [
      "NO.",
      "รายละเอียดอุบัติเหตุ",
      "ชื่อ-นามสกุล",
      "วัน",
      "เดือน",
      "ปี",
      "แผนก",
      "ฝ่าย",
      "สาขา",
      "สายงาน",
      "ประเภทการประสบเหตุ",
      "กิจกรรม",
      "อวัยวะที่ได้รับอุบัติเหตุ",
      "แยกคลาสอุบัติการณ์",
      "ประเภท",
      "ประเภท2",
      "ระดับความรุนแรง",
      "สิทธิการรักษา"
    ];
    const rows = [
      [],
      header,
      [
        1,
        "Near miss at line",
        "Secret Name",
        10,
        "มกราคม",
        2569,
        "Dept",
        "Div",
        "MR7",
        "MMT",
        "สลิป",
        "งาน",
        "มือ",
        "TRI",
        "TOT",
        "Near Miss",
        "ไม่หยุดงาน",
        ""
      ],
      [
        2,
        "Downtime = 2 Hrs machine stop",
        "",
        11,
        "มกราคม",
        2569,
        "Dept",
        "Div",
        "OCP",
        "KTB",
        "อื่นๆ",
        "งาน",
        "",
        "PD",
        "PD",
        "LI",
        "",
        ""
      ],
      [
        3,
        "Property scratch",
        "",
        12,
        "มกราคม",
        2569,
        "Dept",
        "Div",
        "MR8",
        "MMT",
        "อื่นๆ",
        "งาน",
        "",
        "PD",
        "PD",
        "PD",
        "",
        ""
      ]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "DATA ");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = parseSheWorkbook(buffer);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].incidentNo, 1);
    assert.equal(result.rows[0].occurredDate, "2026-01-10");
    assert.equal(result.rows[0].plant, "RMD7");
    assert.equal(result.rows[0].kpiCategory, "Near Miss");
    assert.equal(result.rows[1].incidentNo, 3);
    assert.equal(result.rows[1].kpiCategory, "PD");
    assert.equal(result.stats.excludedCount, 1);
    assert.deepEqual(result.stats.excludedNos, [2]);
    assert.equal(result.stats.skippedInvalidDate.length, 0);
  });

  it("skips blank date template rows without counting skippedInvalidDate", () => {
    const header = [
      "NO.",
      "รายละเอียดอุบัติเหตุ",
      "ชื่อ-นามสกุล",
      "วัน",
      "เดือน",
      "ปี",
      "แผนก",
      "ฝ่าย",
      "สาขา",
      "สายงาน",
      "ประเภทการประสบเหตุ",
      "กิจกรรม",
      "อวัยวะที่ได้รับอุบัติเหตุ",
      "แยกคลาสอุบัติการณ์",
      "ประเภท",
      "ประเภท2",
      "ระดับความรุนแรง",
      "สิทธิการรักษา"
    ];
    const rows = [
      [],
      header,
      [
        10,
        "Template row no date",
        "",
        "",
        "",
        "",
        "Dept",
        "Div",
        "MR7",
        "MMT",
        "สลิป",
        "งาน",
        "มือ",
        "TRI",
        "TOT",
        "Near Miss",
        "",
        ""
      ],
      [
        11,
        "Bad partial date",
        "",
        15,
        "",
        2569,
        "Dept",
        "Div",
        "MR7",
        "MMT",
        "สลิป",
        "งาน",
        "มือ",
        "TRI",
        "TOT",
        "Near Miss",
        "",
        ""
      ]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "DATA ");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = parseSheWorkbook(buffer);
    assert.equal(result.rows.length, 0);
    assert.deepEqual(result.stats.skippedInvalidDate, [11]);
  });
});
