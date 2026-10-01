/*
  This is the SQL Agent Job step body - not something to run by hand.

  In SSMS: SQL Server Agent > Jobs > New Job
    - Name: "RM Weight Sync (hourly)"
    - Step 1, type "Transact-SQL script (T-SQL)", database CEO_REPORT, command = the block below.
    - Schedule: recurring, every 1 hour, daily, starting from whenever you create it.

  Syncs both "today" (keeps intraday numbers current as the shift progresses)
  and "yesterday" (catches any late-arriving weighbridge/schedule rows from
  the previous day) on every run.
*/

DECLARE @today DATE = CAST(GETDATE() AS DATE);
DECLARE @yesterday DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE);

EXEC dbo.usp_sync_rm_weight @report_date = @today;
EXEC dbo.usp_sync_rm_weight @report_date = @yesterday;
