/*
  Run this on CEO_REPORT (<CEO_REPORT_SERVER_HOST>) after 01_linked_servers.sql.
  Creates the staging table (if it doesn't already exist - the app already
  created it once via scripts/create-rm-weight-table.js, so this is a no-op
  there) and the sync procedure the hourly job will call.
*/

IF OBJECT_ID('dbo.tbl_prd_rm_weight', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_prd_rm_weight (
    report_date DATE NOT NULL,
    plant NVARCHAR(20) NOT NULL,
    rm_weight_ton FLOAT NOT NULL,
    fg_weight_ton FLOAT NULL,
    source_note NVARCHAR(200) NULL,
    synced_at DATETIME2 NOT NULL CONSTRAINT DF_prd_rm_weight_synced_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_prd_rm_weight PRIMARY KEY (report_date, plant)
  );
END
GO

-- RMD7/RMD8 per-charge yield: FG bundle weight that pairs with rm_weight_ton (NULL for MSM).
IF COL_LENGTH('dbo.tbl_prd_rm_weight', 'fg_weight_ton') IS NULL
  ALTER TABLE dbo.tbl_prd_rm_weight ADD fg_weight_ton FLOAT NULL;
GO

CREATE OR ALTER PROCEDURE dbo.usp_sync_rm_weight
  @report_date DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @rmd7_kg FLOAT, @rmd8_kg FLOAT, @msm_kg FLOAT, @rmd7_fg_kg FLOAT, @rmd8_fg_kg FLOAT;

  -- RMD7: per charge scheduled on the day that has FG bundle tags (same logic as src/lib/services/rmWeight.ts)
  --   billets used = ROUND(rmd_qty * actual bundles / rmd_bundle), capped at rmd_qty
  --   bl weight    = (billets used - rmd_defect) * rmd_weightbillet;  fg = SUM(tag weight), cancelled tags ('X') excluded
  ;WITH tags AS (
    SELECT rmd_charge, COUNT(*) AS actual_bundle, SUM(ISNULL(rmd_weight, 0)) AS fg_kg
    FROM RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_line
    WHERE rmd_date >= @report_date AND rmd_date < DATEADD(day, 1, @report_date)
      AND ISNULL(rmd_tis_check, '') <> 'X'
    GROUP BY rmd_charge
  ),
  charges AS (
    SELECT
      t.fg_kg,
      ISNULL(s.rmd_weightbillet, 0) AS billet_kg,
      ISNULL(s.rmd_defect, 0) AS defect,
      CASE
        WHEN ISNULL(s.rmd_bundle, 0) <= 0 OR t.actual_bundle >= s.rmd_bundle THEN ISNULL(s.rmd_qty, 0)
        ELSE ROUND(s.rmd_qty * t.actual_bundle / CAST(s.rmd_bundle AS float), 0)
      END AS billets_used
    FROM RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_schedule s
    JOIN tags t ON t.rmd_charge = s.rmd_charge
    WHERE s.rmd_date >= @report_date AND s.rmd_date < DATEADD(day, 1, @report_date)
  )
  SELECT
    @rmd7_fg_kg = SUM(fg_kg),
    @rmd7_kg = SUM(CASE WHEN billets_used > defect THEN (billets_used - defect) * billet_kg ELSE 0 END)
  FROM charges;

  -- RMD8: per charge scheduled on the day that has FG bundle tags (same logic as src/lib/services/rmWeight.ts)
  --   billets used = ROUND(rmd_qty * actual bundles / rmd_bundle), capped at rmd_qty
  --   bl weight    = (billets used - rmd_defect) * rmd_weightbillet;  fg = SUM(tag weight), cancelled tags ('X') excluded
  ;WITH tags AS (
    SELECT rmd_charge, COUNT(*) AS actual_bundle, SUM(ISNULL(rmd_weight, 0)) AS fg_kg
    FROM RM_RMD8.rmd8scale1.dbo.tbl_rmd_weight_line
    WHERE rmd_date >= @report_date AND rmd_date < DATEADD(day, 1, @report_date)
      AND ISNULL(rmd_tis_check, '') <> 'X'
    GROUP BY rmd_charge
  ),
  charges AS (
    SELECT
      t.fg_kg,
      ISNULL(s.rmd_weightbillet, 0) AS billet_kg,
      ISNULL(s.rmd_defect, 0) AS defect,
      CASE
        WHEN ISNULL(s.rmd_bundle, 0) <= 0 OR t.actual_bundle >= s.rmd_bundle THEN ISNULL(s.rmd_qty, 0)
        ELSE ROUND(s.rmd_qty * t.actual_bundle / CAST(s.rmd_bundle AS float), 0)
      END AS billets_used
    FROM RM_RMD8.rmd8scale1.dbo.tbl_rmd_weight_schedule s
    JOIN tags t ON t.rmd_charge = s.rmd_charge
    WHERE s.rmd_date >= @report_date AND s.rmd_date < DATEADD(day, 1, @report_date)
  )
  SELECT
    @rmd8_fg_kg = SUM(fg_kg),
    @rmd8_kg = SUM(CASE WHEN billets_used > defect THEN (billets_used - defect) * billet_kg ELSE 0 END)
  FROM charges;

  -- MSM: scrap charged into the melt shop furnace that day (weighbridge net weight, kg)
  SELECT @msm_kg = SUM(ISNULL(we_weight_net, 0))
  FROM RM_MSM.SMD_SCPCAR.dbo.tbl_weight
  WHERE CONVERT(date, we_date) = @report_date;

  MERGE dbo.tbl_prd_rm_weight AS target
  USING (VALUES
    (@report_date, 'RMD7', ISNULL(@rmd7_kg, 0) / 1000.0, ISNULL(@rmd7_fg_kg, 0) / 1000.0, 'tbl_rmd_weight_schedule x FG tags (per-charge yield)'),
    (@report_date, 'RMD8', ISNULL(@rmd8_kg, 0) / 1000.0, ISNULL(@rmd8_fg_kg, 0) / 1000.0, 'tbl_rmd_weight_schedule x FG tags (per-charge yield)'),
    (@report_date, 'MSM',  ISNULL(@msm_kg, 0)  / 1000.0, NULL,                            'tbl_weight (melt shop weighbridge)')
  ) AS src (report_date, plant, rm_weight_ton, fg_weight_ton, source_note)
    ON target.report_date = src.report_date AND target.plant = src.plant
  WHEN MATCHED THEN
    UPDATE SET rm_weight_ton = src.rm_weight_ton, fg_weight_ton = src.fg_weight_ton,
               source_note = src.source_note, synced_at = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (report_date, plant, rm_weight_ton, fg_weight_ton, source_note, synced_at)
    VALUES (src.report_date, src.plant, src.rm_weight_ton, src.fg_weight_ton, src.source_note, SYSUTCDATETIME());
END
GO

-- Manual test after creating: syncs today, then check the table.
-- EXEC dbo.usp_sync_rm_weight @report_date = CAST(GETDATE() AS DATE);
-- SELECT report_date, plant, rm_weight_ton, fg_weight_ton, source_note FROM dbo.tbl_prd_rm_weight WHERE report_date = CAST(GETDATE() AS DATE);
