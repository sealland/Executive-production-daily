/*
  Run this ONCE on the Downtime SQL Server instance (<DOWNTIME_SERVER_HOST>, database
  "Downtime" - the same one the report already reads from), as a login with
  sysadmin / setupadmin rights.

  Creates one linked server to the "center" (<DOWNTIME_SRC_HOST>), which hosts 3
  separate databases - RMD7Downtime, RMD8Downtime, SMDDowntime - each with its
  own Downtimes table. One linked server is enough since it's a single SQL
  Server instance; the databases are reached via 4-part names like
  DOWNTIME_SRC.RMD7Downtime.dbo.Downtimes.

  Provider note: uses SQLNCLI. If not installed, swap @provider for
  'MSOLEDBSQL' (see sql/rm_weight/01_linked_servers.sql for the same note).
*/

IF NOT EXISTS (SELECT 1 FROM sys.servers WHERE name = 'DOWNTIME_SRC')
BEGIN
  EXEC sp_addlinkedserver
    @server = N'DOWNTIME_SRC',
    @srvproduct = N'',
    @provider = N'SQLNCLI',
    @datasrc = N'<FILL_IN_DOWNTIME_SRC_HOST>';

  EXEC sp_addlinkedsrvlogin
    @rmtsrvname = N'DOWNTIME_SRC',
    @useself = N'FALSE',
    @locallogin = NULL,
    @rmtuser = N'hiprofile',
    @rmtpassword = N'<FILL_IN_DOWNTIME_SRC_PASSWORD>'; -- same password as SQL_DOWNTIME_SRC_PASSWORD in .env

  EXEC sp_serveroption 'DOWNTIME_SRC', 'rpc out', 'true';
END

-- Quick connectivity check for each database (run manually, should return rows if OK):
-- SELECT TOP 5 * FROM DOWNTIME_SRC.RMD7Downtime.dbo.Downtimes ORDER BY StartTime DESC;
-- SELECT TOP 5 * FROM DOWNTIME_SRC.RMD8Downtime.dbo.Downtimes ORDER BY StartTime DESC;
-- SELECT TOP 5 * FROM DOWNTIME_SRC.SMDDowntime.dbo.Downtimes ORDER BY StartTime DESC;
