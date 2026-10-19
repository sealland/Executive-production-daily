-- SHE Excel import (phase 1). Run manually on CEO_REPORT (localhost or production per deploy notes).
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'tbl_she_incident_xls' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.tbl_she_incident_xls (
    id INT IDENTITY(1, 1) NOT NULL,
    incident_no INT NOT NULL,
    file_year INT NOT NULL,
    occurred_date DATE NOT NULL,
    plant NVARCHAR(20) NOT NULL,
    kpi_category NVARCHAR(40) NOT NULL,
    raw_type2 NVARCHAR(80) NULL,
    incident_category NVARCHAR(200) NULL,
    severity NVARCHAR(100) NULL,
    department NVARCHAR(200) NULL,
    detail_short NVARCHAR(200) NULL,
    imported_at DATETIME2(0) NOT NULL CONSTRAINT DF_tbl_she_incident_xls_imported DEFAULT (SYSUTCDATETIME()),
    imported_by NVARCHAR(20) NULL,
    CONSTRAINT PK_tbl_she_incident_xls PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_tbl_she_incident_xls_no_year UNIQUE (incident_no, file_year)
  );

  CREATE INDEX IX_tbl_she_incident_xls_occurred_date ON dbo.tbl_she_incident_xls (occurred_date);
  CREATE INDEX IX_tbl_she_incident_xls_plant_date ON dbo.tbl_she_incident_xls (plant, occurred_date);
END;

IF COL_LENGTH('dbo.tbl_she_incident_xls', 'imported_by') IS NULL
  ALTER TABLE dbo.tbl_she_incident_xls ADD imported_by NVARCHAR(20) NULL;
