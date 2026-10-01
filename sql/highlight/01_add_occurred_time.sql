-- Adds "time the event occurred" (HH:MM, optional) to plant highlights.
-- Run once against CEO_REPORT before deploying the matching app code.
USE CEO_REPORT;
GO

IF COL_LENGTH('dbo.tbl_prd_highlight', 'occurred_time') IS NULL
  ALTER TABLE dbo.tbl_prd_highlight ADD occurred_time NVARCHAR(5) NULL;
GO

IF COL_LENGTH('dbo.tbl_prd_highlight_history', 'occurred_time') IS NULL
  ALTER TABLE dbo.tbl_prd_highlight_history ADD occurred_time NVARCHAR(5) NULL;
GO
