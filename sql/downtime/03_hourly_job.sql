/*
  SQL Agent Job step body - not something to run by hand.

  In SSMS: SQL Server Agent > Jobs > New Job
    - Name: "Downtime Sync (hourly)"
    - Step 1, type "Transact-SQL script (T-SQL)", database CEO_REPORT, command = below.
    - Schedule: recurring, every 1 hour, daily.
*/

EXEC dbo.usp_sync_downtime;
