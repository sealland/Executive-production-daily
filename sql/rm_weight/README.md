# RM Weight Sync (SQL Agent version)

Pure T-SQL alternative to `scripts/sync-rm-weight.js` / `npm run rm:sync`, so this can run
as a SQL Server Agent job on the **CEO_REPORT** instance (<CEO_REPORT_SERVER_HOST>) instead of a
Node scheduled task.

## Run order (on CEO_REPORT, via SSMS)

1. **`01_linked_servers.sql`** — one-time. Creates linked servers to RMD7/RMD8/MSM.
   Fill in the `<FILL_IN_..._SA_PASSWORD>` placeholders with the same passwords already
   in `.env` (`SQL_RM_RMD7_PASSWORD`, `SQL_RM_RMD8_PASSWORD`, `SQL_RM_MSM_PASSWORD`)
   before running. Needs sysadmin/setupadmin rights. Test queries are commented at the
   bottom — run those first to confirm connectivity before moving on.
2. **`02_rm_weight_table_and_procedure.sql`** — one-time. Creates `tbl_prd_rm_weight`
   (already exists if the Node pipeline ran first — this is idempotent) and the
   `usp_sync_rm_weight @report_date` procedure that both the hourly job and the backfill
   call into.
3. **`04_backfill_2_years.sql`** — one-time, run manually. Backfills the last 2 years,
   one day at a time. Try a short date range first (edit `DATEADD(YEAR, -2, ...)` to
   `DATEADD(DAY, -30, ...)` for a quick check) before committing to the full 2 years.
4. **`03_hourly_job.sql`** — the recurring piece. Paste this as the T-SQL step body of a
   new SQL Agent Job scheduled to run every 1 hour. Syncs both today and yesterday on
   every run.

## Same source tables as the Node version

| Plant | Source | Formula |
|---|---|---|
| RMD7 | `RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_schedule` + `tbl_rmd_weight_line` (FG tags) | per charge, see below |
| RMD8 | `RM_RMD8.rmd8scale1.dbo.tbl_rmd_weight_schedule` + `tbl_rmd_weight_line` (FG tags) | per charge, see below |
| MSM | `RM_MSM.SMD_SCPCAR.dbo.tbl_weight` | `SUM(we_weight_net)` kg |

RMD7/RMD8 yield is per charge, only for charges on the day that already have FG bundle tags
(tags joined on `rmd_charge` + date; cancelled tags `rmd_tis_check = 'X'` excluded):

- billets used = `ROUND(rmd_qty * actual bundles / rmd_bundle)`, capped at `rmd_qty`
  (a charge still being rolled only counts the billets used so far)
- `rm_weight_ton` (bl weight) = `(billets used - rmd_defect) * rmd_weightbillet`
- `fg_weight_ton` = `SUM(rmd_weight)` of the tags
- Yield = `fg_weight_ton / rm_weight_ton` (MSM: Actual / `rm_weight_ton`, `fg_weight_ton` is NULL)

All divided by 1000 to store as tons in `tbl_prd_rm_weight`. The report reads this same
table via `/api/production/rm-weight`, regardless of whether it was populated by the
Node script or this SQL Agent job — pick one, don't run both against the same table at
the same time (harmless if you do, just redundant).
