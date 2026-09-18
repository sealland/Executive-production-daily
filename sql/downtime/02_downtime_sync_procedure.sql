/*
  Run this on CEO_REPORT (192.168.100.222) after 01_linked_server.sql - the linked
  server is instance-level, so it's visible from CEO_REPORT even though it was
  created while connected to the Downtime database.

  Creates usp_sync_downtime - copies new rows from each plant's own Downtimes
  table (via the DOWNTIME_SRC linked server) into the shared Downtime.dbo.Downtimes
  table, same one the report already queries. Downtime and CEO_REPORT are both
  databases on the same SQL Server instance, so the target table is reached with
  a plain 3-part name (Downtime.dbo.Downtimes) - no second linked server needed.

  Incremental by design: for each plant/Machine code, only pulls source rows
  newer than the latest StartTime already present there. First run backfills
  whatever gap exists; every run after that only picks up new events - safe
  to schedule hourly, no separate backfill script needed.

  Same source tables / mapping as scripts/sync-downtime.js:
    RMD7Downtime.dbo.Downtimes  -> Machine 'MR7'
    RMD8Downtime.dbo.Downtimes  -> Machine 'MR8'
    SMDDowntime.dbo.Downtimes   -> Machine 'MSM'  (source PK column is "Id", not "ID")
*/

CREATE OR ALTER PROCEDURE dbo.usp_sync_downtime
AS
BEGIN
  SET NOCOUNT ON;

  -- ===== RMD7 -> MR7 =====
  DECLARE @since_rmd7 DATETIME2 = (SELECT MAX(StartTime) FROM Downtime.dbo.Downtimes WHERE Machine = 'MR7');
  INSERT INTO Downtime.dbo.Downtimes
    (Machine, ID, StartTime, EndTime, Minute, [Group], Station, NoOfBillet, [Return], Cobble, HeatNo, Grade, Problem, Cause, [Resolve], Area, Code)
  SELECT
    'MR7', src.ID, src.StartTime, src.EndTime, src.Minute, src.[Group], src.Station,
    src.NoOfBillet, src.[Return], src.Cobble, src.HeatNo, src.Grade, src.Problem, src.Cause, src.[Resolve], src.Area, src.Code
  FROM DOWNTIME_SRC.RMD7Downtime.dbo.Downtimes AS src
  WHERE @since_rmd7 IS NULL OR src.StartTime > @since_rmd7;

  -- ===== RMD8 -> MR8 =====
  DECLARE @since_rmd8 DATETIME2 = (SELECT MAX(StartTime) FROM Downtime.dbo.Downtimes WHERE Machine = 'MR8');
  INSERT INTO Downtime.dbo.Downtimes
    (Machine, ID, StartTime, EndTime, Minute, [Group], Station, NoOfBillet, [Return], Cobble, HeatNo, Grade, Problem, Cause, [Resolve], Area, Code)
  SELECT
    'MR8', src.ID, src.StartTime, src.EndTime, src.Minute, src.[Group], src.Station,
    src.NoOfBillet, src.[Return], src.Cobble, src.HeatNo, src.Grade, src.Problem, src.Cause, src.[Resolve], src.Area, src.Code
  FROM DOWNTIME_SRC.RMD8Downtime.dbo.Downtimes AS src
  WHERE @since_rmd8 IS NULL OR src.StartTime > @since_rmd8;

  -- ===== SMD -> MSM (source id column is "Id") =====
  DECLARE @since_msm DATETIME2 = (SELECT MAX(StartTime) FROM Downtime.dbo.Downtimes WHERE Machine = 'MSM');
  INSERT INTO Downtime.dbo.Downtimes
    (Machine, ID, StartTime, EndTime, Minute, [Group], Station, NoOfBillet, [Return], Cobble, HeatNo, Grade, Problem, Cause, [Resolve], Area, Code)
  SELECT
    'MSM', src.Id, src.StartTime, src.EndTime, src.Minute, src.[Group], src.Station,
    src.NoOfBillet, src.[Return], src.Cobble, src.HeatNo, src.Grade, src.Problem, src.Cause, src.[Resolve], src.Area, src.Code
  FROM DOWNTIME_SRC.SMDDowntime.dbo.Downtimes AS src
  WHERE @since_msm IS NULL OR src.StartTime > @since_msm;
END
GO

-- Manual test after creating:
-- EXEC dbo.usp_sync_downtime;
-- SELECT Machine, COUNT(*) AS n, MAX(StartTime) AS latest FROM Downtime.dbo.Downtimes WHERE Machine IN ('MR7','MR8','MSM') GROUP BY Machine;
