# Access Log for Executive Report — Design

**Date:** 2026-09-22  
**Status:** Approved — implementing / implemented

## Goal

When the Executive Production Report is opened with `?currentUser=<employee code>`, resolve the employee on `SQL_SERVER_HOST` and append one access-log row to a separate SQL Server, with `report_name` hardcoded as `Executive-Report`.

## Flow

1. Browser opens `/executive-report/index.html?currentUser=56070033` (existing FE already calls `/api/employee/lookup?code=...`).
2. API looks up the employee in `{SQL_SERVER_INFO_DATABASE}.dbo.ZHR_EMPLOYEE` on `SQL_SERVER_HOST` (same host/credentials as CEO pool).
3. Derive `username` from `eng_name` (see rules below).
4. If employee found, insert one row into `tbl_access_log` on the access-log server.
5. Return employee payload to the UI as today. Access-log failure must not fail the lookup response.

## Username derivation

Source field: `eng_name` (example: `Miss Jutamat  Siwakun`).

Rules:

1. Trim and collapse repeated whitespace.
2. Drop a leading English title if present: `Miss`, `Mrs`, `Mr`, `Ms`, `Dr` (case-insensitive).
3. Remaining tokens = given name + family name (and any middle tokens).
4. Output: `{GivenName}.{firstLetterOfLastName}` lowercasing only the last-name initial; given name keeps original casing from the source after title strip.
   - `Miss Jutamat  Siwakun` → `Jutamat.s`
   - If only one name token remains after title strip → use that token alone (no `.x`).
   - If `eng_name` empty/null → fall back to existing display name sanitised the same way if possible; otherwise skip access log (still return employee if code matches).

## Environment variables

### Employee DB (new)

| Variable | Purpose | Example |
|---|---|---|
| `SQL_SERVER_INFO_DATABASE` | Database containing `ZHR_EMPLOYEE` on `SQL_SERVER_HOST` | `INFO` |

Reuse existing `SQL_SERVER_HOST`, `SQL_SERVER_PORT`, `SQL_SERVER_USER`, `SQL_SERVER_PASSWORD`, encrypt/trust flags.

### Access log server (new full set)

| Variable | Purpose |
|---|---|
| `SQL_ACCESS_LOG_HOST` | Host / IP |
| `SQL_ACCESS_LOG_PORT` | Default `1433` |
| `SQL_ACCESS_LOG_DATABASE` | Database name |
| `SQL_ACCESS_LOG_USER` | Login |
| `SQL_ACCESS_LOG_PASSWORD` | Password |
| `SQL_ACCESS_LOG_ENCRYPT` | Default `false` |
| `SQL_ACCESS_LOG_TRUST_SERVER_CERT` | Default `true` |
| `SQL_ACCESS_LOG_SCHEMA` | Default `dbo` |
| `SQL_ACCESS_LOG_TABLE` | Default `tbl_access_log` |

## Data write

Table shape (existing):

| Column | Source |
|---|---|
| `id` | Identity — do not insert |
| `PRS_NO` | Employee code (`currentUser`) |
| `username` | Derived from `eng_name` |
| `access_time` | SQL `SYSDATETIME()` / `GETDATE()` on insert |
| `report_name` | Hardcoded `Executive-Report` |

```sql
INSERT INTO [{schema}].[{table}] (PRS_NO, username, access_time, report_name)
VALUES (@prsNo, @username, SYSDATETIME(), N'Executive-Report');
```

## API change

Extend existing `GET /api/employee/lookup?code=...` (Approach 1):

1. Lookup employee (include `eng_name` in SELECT; response shape to FE can stay `{ code, name, position }`).
2. If found and access-log pool is configured → insert log (fire-and-await, but catch errors).
3. If access-log not configured → skip insert, still return employee.
4. If employee not found → return `{ employee: null }`, no insert.

## Non-goals

- No session dedupe (every page load with `currentUser` writes one row).
- No change to highlight/SHE auth beyond shared lookup path.
- No UI for browsing access logs.

## Files to touch

- `.env.example` (+ local `.env` placeholders only if already present pattern)
- `src/lib/db/ceo.ts` or small helper for INFO DB name in employee query
- `src/lib/db/accessLog.ts` — new pool
- `src/lib/services/employee.ts` — select `eng_name`, derive username
- `src/lib/services/accessLog.ts` — insert helper
- `src/app/api/employee/lookup/route.ts` — call insert after successful lookup
- Optional unit-less pure helper for username formatting (testable)

## Success criteria

- `?currentUser=validCode` shows chip as today and adds one `tbl_access_log` row with `report_name = Executive-Report` and derived `username`.
- Invalid code → no log row.
- Access-log DB down → page still loads employee chip; server logs error.
