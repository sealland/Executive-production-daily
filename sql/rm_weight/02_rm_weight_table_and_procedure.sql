/*
  Run this on CEO_REPORT (192.168.100.222) after 01_linked_servers.sql.
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
    source_note NVARCHAR(200) NULL,
    synced_at DATETIME2 NOT NULL CONSTRAINT DF_prd_rm_weight_synced_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_prd_rm_weight PRIMARY KEY (report_date, plant)
  );
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_sync_rm_weight
  @report_date DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @rmd7_kg FLOAT, @rmd8_kg FLOAT, @msm_kg FLOAT;

  -- RMD7: billets charged into the rolling mill that day (qty * weight per billet, kg)
  SELECT @rmd7_kg = SUM(ISNULL(rmd_qty, 0) * ISNULL(rmd_weightbillet, 0))
  FROM RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_schedule
  WHERE CONVERT(date, rmd_date) = @report_date;

  -- RMD8: same idea, RMD8's own weight-schedule table
  SELECT @rmd8_kg = SUM(ISNULL(rmd_qty, 0) * ISNULL(rmd_weightbillet, 0))
  FROM RM_RMD8.rmd8scale1.dbo.tbl_rmd_weight_schedule
  WHERE CONVERT(date, rmd_date) = @report_date;

  -- MSM: scrap charged into the melt shop furnace that day (weighbridge net weight, kg)
  SELECT @msm_kg = SUM(ISNULL(we_weight_net, 0))
  FROM RM_MSM.SMD_SCPCAR.dbo.tbl_weight
  WHERE CONVERT(date, we_date) = @report_date;

  MERGE dbo.tbl_prd_rm_weight AS target
  USING (VALUES
    (@report_date, 'RMD7', ISNULL(@rmd7_kg, 0) / 1000.0, 'tbl_rmd_weight_schedule (billet charge)'),
    (@report_date, 'RMD8', ISNULL(@rmd8_kg, 0) / 1000.0, 'tbl_rmd_weight_schedule (billet charge)'),
    (@report_date, 'MSM',  ISNULL(@msm_kg, 0)  / 1000.0, 'tbl_weight (melt shop weighbridge)')
  ) AS src (report_date, plant, rm_weight_ton, source_note)
    ON target.report_date = src.report_date AND target.plant = src.plant
  WHEN MATCHED THEN
    UPDATE SET rm_weight_ton = src.rm_weight_ton, source_note = src.source_note, synced_at = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (report_date, plant, rm_weight_ton, source_note, synced_at)
    VALUES (src.report_date, src.plant, src.rm_weight_ton, src.source_note, SYSUTCDATETIME());
END
GO

-- Manual test after creating: syncs today, then check the table.
-- EXEC dbo.usp_sync_rm_weight @report_date = CAST(GETDATE() AS DATE);
-- SELECT * FROM dbo.tbl_prd_rm_weight WHERE report_date = CAST(GETDATE() AS DATE);
