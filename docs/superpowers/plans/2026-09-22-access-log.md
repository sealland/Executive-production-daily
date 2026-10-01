# Access Log Implementation Plan

> **For agentic workers:** Implement tasks below in order. Spec: `docs/superpowers/specs/2026-09-22-access-log-design.md`

**Goal:** On `GET /api/employee/lookup?code=...`, derive username from `eng_name` and insert one `tbl_access_log` row (`report_name=Executive-Report`) when access-log DB is configured.

**Tech:** Next.js route handler, existing `mssql` pools pattern.

## File map

| File | Role |
|---|---|
| `src/lib/format/username.ts` | Pure `eng_name` → `Jutamat.s` |
| `src/lib/db/accessLog.ts` | Access-log connection pool |
| `src/lib/services/accessLog.ts` | Insert helper |
| `src/lib/services/employee.ts` | INFO DB + eng_name select |
| `src/app/api/employee/lookup/route.ts` | Log after successful lookup |
| `.env.example` / `.env` | New env vars |

## Tasks

1. Add username helper + env/db/service/API wiring (single vertical slice).
2. Smoke: lookup with valid code returns employee; verify insert when `SQL_ACCESS_LOG_*` set.
