/*
  One-time backfill: syncs RM weight for every day in the last 2 years.
  Run this manually on CEO_REPORT after 01 and 02 have been run successfully
  (and after confirming the linked-server test queries at the bottom of
  01_linked_servers.sql return rows).

  This does ~730 days x 3 remote queries = ~2,190 cross-server round trips.
  Expect this to take a while (minutes to tens of minutes depending on link
  latency) - run it outside business hours, and consider running it in
  smaller date chunks first (e.g. last 30 days) to sanity-check before
  committing to the full 2 years.
*/

SET NOCOUNT ON;

DECLARE @d DATE = DATEADD(YEAR, -2, CAST(GETDATE() AS DATE));
DECLARE @end_date DATE = CAST(GETDATE() AS DATE);

WHILE @d <= @end_date
BEGIN
  BEGIN TRY
    EXEC dbo.usp_sync_rm_weight @report_date = @d;
    PRINT 'OK   ' + CONVERT(varchar(10), @d, 23);
  END TRY
  BEGIN CATCH
    PRINT 'FAIL ' + CONVERT(varchar(10), @d, 23) + ' - ' + ERROR_MESSAGE();
  END CATCH

  SET @d = DATEADD(DAY, 1, @d);
END

PRINT 'Backfill complete.';

-- Sanity check afterwards:
-- SELECT plant, COUNT(*) AS days_synced, MIN(report_date) AS from_date, MAX(report_date) AS to_date
-- FROM dbo.tbl_prd_rm_weight
-- GROUP BY plant;
