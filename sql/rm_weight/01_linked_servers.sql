/*
  Run this ONCE on the CEO_REPORT SQL Server instance (<CEO_REPORT_SERVER_HOST>),
  as a login with sysadmin / setupadmin rights (linked-server creation needs it).

  Creates 3 linked servers pointing at each plant's own SQL Server, so the
  hourly sync job (02_rm_weight_sync_procedure.sql) can query them with plain
  4-part names like RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_schedule.

  Provider note: this uses SQLNCLI (SQL Server Native Client OLE DB driver).
  If SQLNCLI isn't installed on this SQL Server, use 'MSOLEDBSQL' instead
  (newer Microsoft OLE DB Driver for SQL Server) - just swap @provider below.
  Check installed providers with:
    EXEC sp_linkedservers;  -- lists existing linked servers
    SELECT name FROM sys.dm_os_loaded_modules WHERE name LIKE '%sqlncli%' OR name LIKE '%msoledbsql%';
*/

-- ===== RMD7 (<SQL_RM_RMD7_HOST> / CD2SCALE) =====
IF NOT EXISTS (SELECT 1 FROM sys.servers WHERE name = 'RM_RMD7')
BEGIN
  EXEC sp_addlinkedserver
    @server = N'RM_RMD7',
    @srvproduct = N'',
    @provider = N'SQLNCLI',
    @datasrc = N'<FILL_IN_RMD7_HOST>';

  EXEC sp_addlinkedsrvlogin
    @rmtsrvname = N'RM_RMD7',
    @useself = N'FALSE',
    @locallogin = NULL,
    @rmtuser = N'sa',
    @rmtpassword = N'<FILL_IN_RMD7_SA_PASSWORD>'; -- same password as SQL_RM_RMD7_PASSWORD in .env

  -- RPC out is needed for some drivers/queries; harmless to enable.
  EXEC sp_serveroption 'RM_RMD7', 'rpc out', 'true';
END

-- ===== RMD8 (<SQL_RM_RMD8_HOST> / rmd8scale1) =====
IF NOT EXISTS (SELECT 1 FROM sys.servers WHERE name = 'RM_RMD8')
BEGIN
  EXEC sp_addlinkedserver
    @server = N'RM_RMD8',
    @srvproduct = N'',
    @provider = N'SQLNCLI',
    @datasrc = N'<FILL_IN_RMD8_HOST>';

  EXEC sp_addlinkedsrvlogin
    @rmtsrvname = N'RM_RMD8',
    @useself = N'FALSE',
    @locallogin = NULL,
    @rmtuser = N'sa',
    @rmtpassword = N'<FILL_IN_RMD8_SA_PASSWORD>'; -- same password as SQL_RM_RMD8_PASSWORD in .env

  EXEC sp_serveroption 'RM_RMD8', 'rpc out', 'true';
END

-- ===== MSM (<SQL_RM_MSM_HOST> / SMD_SCPCAR) =====
IF NOT EXISTS (SELECT 1 FROM sys.servers WHERE name = 'RM_MSM')
BEGIN
  EXEC sp_addlinkedserver
    @server = N'RM_MSM',
    @srvproduct = N'',
    @provider = N'SQLNCLI',
    @datasrc = N'<FILL_IN_MSM_HOST>';

  EXEC sp_addlinkedsrvlogin
    @rmtsrvname = N'RM_MSM',
    @useself = N'FALSE',
    @locallogin = NULL,
    @rmtuser = N'sa',
    @rmtpassword = N'<FILL_IN_MSM_SA_PASSWORD>'; -- same password as SQL_RM_MSM_PASSWORD in .env

  EXEC sp_serveroption 'RM_MSM', 'rpc out', 'true';
END

-- Quick connectivity check for each (run manually, should return rows if OK):
-- SELECT TOP 5 * FROM RM_RMD7.CD2SCALE.dbo.tbl_rmd_weight_schedule ORDER BY rmd_date DESC;
-- SELECT TOP 5 * FROM RM_RMD8.rmd8scale1.dbo.tbl_rmd_weight_schedule ORDER BY rmd_date DESC;
-- SELECT TOP 5 * FROM RM_MSM.SMD_SCPCAR.dbo.tbl_weight ORDER BY we_date DESC;
