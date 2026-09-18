# Downtime Sync (SQL Agent version)

Pure T-SQL alternative to `scripts/sync-downtime.js` / `npm run downtime:sync`, so this
can run as a SQL Server Agent job on the **Downtime** instance (192.168.100.222)
instead of a Node scheduled task. Same mapping, same target table
(`dbo.Downtimes`) - pick one, don't run both against it at the same time.

## Run order (on CEO_REPORT, via SSMS)

Downtime and CEO_REPORT are both databases on the same instance (192.168.100.222).
`usp_sync_downtime` lives in **CEO_REPORT** (alongside the RM sync job and any other
scheduled procedures) but writes into `Downtime.dbo.Downtimes` using a plain 3-part
name - no linked server needed between the two, just qualify the database.

1. **`01_linked_server.sql`** — one-time, run from either database (linked servers are
   instance-level). Creates one linked server (`DOWNTIME_SRC`) to the center at
   192.168.110.30 (it hosts all 3 plant databases, so one linked server covers all of
   them via 4-part names). Fill in `<FILL_IN_DOWNTIME_SRC_PASSWORD>` with the same
   password already in `.env` (`SQL_DOWNTIME_SRC_PASSWORD`) before running. Needs
   sysadmin/setupadmin rights. Test the 3 commented `SELECT` queries at the bottom
   before moving on.
2. **`02_downtime_sync_procedure.sql`** — one-time, run on **CEO_REPORT**. Creates
   `usp_sync_downtime`, which copies new rows for all 3 plants in one call, writing
   into `Downtime.dbo.Downtimes` (3-part name, same-instance). Incremental by design
   (compares against `MAX(StartTime)` already stored per `Machine` code) - the
   **first run backfills whatever gap exists**, no separate backfill script needed
   like the RM pipeline had.
3. **`03_hourly_job.sql`** — the recurring piece. Paste as the T-SQL step body of a SQL
   Agent Job scheduled every 1 hour, with the step's database set to **CEO_REPORT**.

> If you'd rather keep it in the `Downtime` database instead of `CEO_REPORT`, that
> works too - just drop the `Downtime.` prefix in `02_downtime_sync_procedure.sql`
> (revert to plain `dbo.Downtimes`) and create the procedure there instead. The
> `invalid object dbo.Downtimes` error happens specifically when the procedure's
> database context (CEO_REPORT) doesn't match where the unqualified table lives.

## Source tables / mapping

| Plant | Source (via `DOWNTIME_SRC` linked server) | Central `Machine` code |
|---|---|---|
| RMD7 | `DOWNTIME_SRC.RMD7Downtime.dbo.Downtimes` | `MR7` |
| RMD8 | `DOWNTIME_SRC.RMD8Downtime.dbo.Downtimes` | `MR8` |
| SMD (MSM) | `DOWNTIME_SRC.SMDDowntime.dbo.Downtimes` | `MSM` |

Note SMD's source table uses `Id` as its identity column name (lowercase-ish), not
`ID` like RMD7/RMD8 - already handled in the procedure.

The Node version (`npm run downtime:sync`, already run once manually) backfilled the
gap already: RMD7 +1,355 rows, RMD8 +5,170 rows, MSM +603 rows, bringing
`dbo.Downtimes` up to date through 18 Sep 2026 for all 3 plants. Setting up this SQL
Agent job is only needed if you want the sync to keep running from SQL Server itself
instead of the Node script.
