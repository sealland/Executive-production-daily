/**
 * Import SHE accident Excel into tbl_she_incident_xls.
 * Requires SHE_IMPORT_ENABLED=true. This CLI bypasses the uploader allowlist
 * (SHE_UPLOAD_EMPCODES) and is for operators only.
 * Run: npm run she:import -- path/to/file.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { importSheXlsxBuffer } from "../src/lib/services/sheImport";

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: npm run she:import -- <path-to.xlsx>");
    process.exit(1);
  }
  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }
  const buffer = fs.readFileSync(filePath);
  const result = await importSheXlsxBuffer(buffer, path.basename(filePath), "cli");
  console.log(
    JSON.stringify(
      {
        imported: result.imported,
        importedCount: result.stats.importedCount,
        excludedCount: result.stats.excludedCount,
        excludedNos: result.stats.excludedNos,
        borderlineNos: result.stats.borderlineNos,
        skippedInvalidDate: result.stats.skippedInvalidDate,
        fileYear: result.fileYear
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
