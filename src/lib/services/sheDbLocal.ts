/** SHE Excel import is gated by SHE_IMPORT_ENABLED (works on prod or localhost when enabled). */
export function assertSheImportEnabled(): void {
  const enabled = (process.env.SHE_IMPORT_ENABLED || "").trim().toLowerCase();
  if (enabled !== "true") {
    throw new Error("SHE import is disabled: set SHE_IMPORT_ENABLED=true to enable Excel import");
  }
}

export function assertSheUploader(empCode: string): void {
  const raw = (process.env.SHE_UPLOAD_EMPCODES || "").trim();
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || !list.includes(empCode)) {
    throw new Error("not allowed to upload SHE Excel");
  }
}
