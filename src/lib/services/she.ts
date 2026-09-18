import { getCeoPool, sql } from "@/lib/db/ceo";
import { requireEmployee } from "@/lib/services/employee";
import type {
  IncidentStatus,
  LtiHistoryEntry,
  LtiStatus,
  SheIncident,
  SheIncidentHistoryEntry
} from "@/lib/types/she";

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + "T00:00:00Z").getTime();
  const to = new Date(toDate + "T00:00:00Z").getTime();
  return Math.round((to - from) / 86400000);
}

/** mssql returns SQL `date` columns as JS Date objects; normalize to YYYY-MM-DD (UTC). */
function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// ---------------- Days without LTI ----------------

export async function getLtiStatus(asOfDate: string): Promise<LtiStatus> {
  const pool = await getCeoPool();
  const result = await pool.request().query(`
    SELECT TOP 1 last_lti_date, updated_by_code, updated_by_name, updated_by_position, updated_at
    FROM dbo.tbl_she_lti_tracker
    WHERE singleton_key = 1
  `);
  const row = result.recordset[0] as
    | {
        last_lti_date: string;
        updated_by_code: string;
        updated_by_name: string | null;
        updated_by_position: string | null;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    return { lastLtiDate: null, daysWithoutLti: null, updatedBy: null, updatedAt: null };
  }
  const lastLtiDate = toIsoDate(row.last_lti_date);
  return {
    lastLtiDate,
    daysWithoutLti: daysBetween(lastLtiDate, asOfDate),
    updatedBy: { code: row.updated_by_code, name: row.updated_by_name || row.updated_by_code, position: row.updated_by_position },
    updatedAt: row.updated_at
  };
}

export async function updateLtiDate(lastLtiDate: string, empCode: string, asOfDate: string): Promise<LtiStatus> {
  const employee = await requireEmployee(empCode);
  const pool = await getCeoPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const upsert = new sql.Request(tx);
    upsert
      .input("d", sql.Date, lastLtiDate)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await upsert.query(`
      MERGE dbo.tbl_she_lti_tracker AS target
      USING (SELECT 1 AS singleton_key) AS src ON target.singleton_key = src.singleton_key
      WHEN MATCHED THEN
        UPDATE SET last_lti_date = @d, updated_by_code = @code, updated_by_name = @name,
                   updated_by_position = @position, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (singleton_key, last_lti_date, updated_by_code, updated_by_name, updated_by_position, updated_at)
        VALUES (1, @d, @code, @name, @position, SYSUTCDATETIME());
    `);

    const history = new sql.Request(tx);
    history
      .input("d", sql.Date, lastLtiDate)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await history.query(`
      INSERT INTO dbo.tbl_she_lti_history (last_lti_date, edited_by_code, edited_by_name, edited_by_position, edited_at)
      VALUES (@d, @code, @name, @position, SYSUTCDATETIME());
    `);

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  return getLtiStatus(asOfDate);
}

export async function getLtiHistory(): Promise<LtiHistoryEntry[]> {
  const pool = await getCeoPool();
  const result = await pool.request().query(`
    SELECT last_lti_date, edited_by_code, edited_by_name, edited_by_position, edited_at
    FROM dbo.tbl_she_lti_history
    ORDER BY edited_at DESC
  `);
  return result.recordset.map((row: {
    last_lti_date: string;
    edited_by_code: string;
    edited_by_name: string | null;
    edited_by_position: string | null;
    edited_at: string;
  }) => ({
    lastLtiDate: toIsoDate(row.last_lti_date),
    editedBy: { code: row.edited_by_code, name: row.edited_by_name || row.edited_by_code, position: row.edited_by_position },
    editedAt: row.edited_at
  }));
}

// ---------------- Incidents ----------------

type IncidentRow = {
  id: number;
  report_date: string;
  plant: string | null;
  title: string;
  description: string | null;
  location: string | null;
  occurred_time: string | null;
  status: string;
  created_by_code: string;
  created_by_name: string | null;
  created_by_position: string | null;
  created_at: string;
  updated_by_code: string | null;
  updated_by_name: string | null;
  updated_by_position: string | null;
  updated_at: string | null;
};

function mapIncidentRow(row: IncidentRow): SheIncident {
  return {
    id: row.id,
    reportDate: toIsoDate(row.report_date),
    plant: row.plant,
    title: row.title,
    description: row.description,
    location: row.location,
    occurredTime: row.occurred_time,
    status: row.status as IncidentStatus,
    createdBy: { code: row.created_by_code, name: row.created_by_name || row.created_by_code, position: row.created_by_position },
    createdAt: row.created_at,
    updatedBy: row.updated_by_code
      ? { code: row.updated_by_code, name: row.updated_by_name || row.updated_by_code, position: row.updated_by_position }
      : null,
    updatedAt: row.updated_at
  };
}

export async function listIncidents(reportDate: string): Promise<SheIncident[]> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT id, report_date, plant, title, description, location, occurred_time, status,
             created_by_code, created_by_name, created_by_position, created_at,
             updated_by_code, updated_by_name, updated_by_position, updated_at
      FROM dbo.tbl_she_incident
      WHERE report_date = @d
      ORDER BY created_at DESC
    `);
  return (result.recordset as IncidentRow[]).map(mapIncidentRow);
}

export interface CreateIncidentInput {
  reportDate: string;
  plant: string | null;
  title: string;
  description: string | null;
  location: string | null;
  occurredTime: string | null;
  status: IncidentStatus;
}

export async function createIncident(input: CreateIncidentInput, empCode: string): Promise<SheIncident> {
  const employee = await requireEmployee(empCode);
  const pool = await getCeoPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  let newId = 0;
  try {
    const insert = new sql.Request(tx);
    insert
      .input("d", sql.Date, input.reportDate)
      .input("plant", sql.NVarChar, input.plant)
      .input("title", sql.NVarChar, input.title)
      .input("description", sql.NVarChar, input.description)
      .input("location", sql.NVarChar, input.location)
      .input("occurredTime", sql.NVarChar, input.occurredTime)
      .input("status", sql.NVarChar, input.status)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    const insertResult = await insert.query(`
      INSERT INTO dbo.tbl_she_incident
        (report_date, plant, title, description, location, occurred_time, status, created_by_code, created_by_name, created_by_position)
      OUTPUT INSERTED.id
      VALUES (@d, @plant, @title, @description, @location, @occurredTime, @status, @code, @name, @position);
    `);
    newId = insertResult.recordset[0].id;

    const history = new sql.Request(tx);
    history
      .input("incidentId", sql.Int, newId)
      .input("title", sql.NVarChar, input.title)
      .input("description", sql.NVarChar, input.description)
      .input("location", sql.NVarChar, input.location)
      .input("occurredTime", sql.NVarChar, input.occurredTime)
      .input("status", sql.NVarChar, input.status)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await history.query(`
      INSERT INTO dbo.tbl_she_incident_history
        (incident_id, title, description, location, occurred_time, status, action, edited_by_code, edited_by_name, edited_by_position)
      VALUES (@incidentId, @title, @description, @location, @occurredTime, @status, 'created', @code, @name, @position);
    `);

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const pool2 = await getCeoPool();
  const result = await pool2.request().input("id", sql.Int, newId).query(`
    SELECT id, report_date, plant, title, description, location, occurred_time, status,
           created_by_code, created_by_name, created_by_position, created_at,
           updated_by_code, updated_by_name, updated_by_position, updated_at
    FROM dbo.tbl_she_incident WHERE id = @id
  `);
  return mapIncidentRow(result.recordset[0] as IncidentRow);
}

export interface UpdateIncidentInput {
  title: string;
  description: string | null;
  location: string | null;
  occurredTime: string | null;
  status: IncidentStatus;
}

export async function updateIncident(id: number, input: UpdateIncidentInput, empCode: string): Promise<SheIncident> {
  const employee = await requireEmployee(empCode);
  const pool = await getCeoPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const update = new sql.Request(tx);
    update
      .input("id", sql.Int, id)
      .input("title", sql.NVarChar, input.title)
      .input("description", sql.NVarChar, input.description)
      .input("location", sql.NVarChar, input.location)
      .input("occurredTime", sql.NVarChar, input.occurredTime)
      .input("status", sql.NVarChar, input.status)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    const updateResult = await update.query(`
      UPDATE dbo.tbl_she_incident
      SET title = @title, description = @description, location = @location, occurred_time = @occurredTime,
          status = @status, updated_by_code = @code, updated_by_name = @name, updated_by_position = @position,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id;
    `);
    if (updateResult.rowsAffected[0] === 0) {
      throw new Error(`Incident ${id} not found`);
    }

    const history = new sql.Request(tx);
    history
      .input("incidentId", sql.Int, id)
      .input("title", sql.NVarChar, input.title)
      .input("description", sql.NVarChar, input.description)
      .input("location", sql.NVarChar, input.location)
      .input("occurredTime", sql.NVarChar, input.occurredTime)
      .input("status", sql.NVarChar, input.status)
      .input("code", sql.NVarChar, employee.code)
      .input("name", sql.NVarChar, employee.name)
      .input("position", sql.NVarChar, employee.position);
    await history.query(`
      INSERT INTO dbo.tbl_she_incident_history
        (incident_id, title, description, location, occurred_time, status, action, edited_by_code, edited_by_name, edited_by_position)
      VALUES (@incidentId, @title, @description, @location, @occurredTime, @status, 'updated', @code, @name, @position);
    `);

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const pool2 = await getCeoPool();
  const result = await pool2.request().input("id", sql.Int, id).query(`
    SELECT id, report_date, plant, title, description, location, occurred_time, status,
           created_by_code, created_by_name, created_by_position, created_at,
           updated_by_code, updated_by_name, updated_by_position, updated_at
    FROM dbo.tbl_she_incident WHERE id = @id
  `);
  return mapIncidentRow(result.recordset[0] as IncidentRow);
}

export async function getIncidentHistory(incidentId: number): Promise<SheIncidentHistoryEntry[]> {
  const pool = await getCeoPool();
  const result = await pool.request().input("id", sql.Int, incidentId).query(`
    SELECT incident_id, title, description, location, occurred_time, status, action,
           edited_by_code, edited_by_name, edited_by_position, edited_at
    FROM dbo.tbl_she_incident_history
    WHERE incident_id = @id
    ORDER BY edited_at DESC
  `);
  return result.recordset.map((row: {
    incident_id: number;
    title: string;
    description: string | null;
    location: string | null;
    occurred_time: string | null;
    status: string;
    action: string;
    edited_by_code: string;
    edited_by_name: string | null;
    edited_by_position: string | null;
    edited_at: string;
  }) => ({
    incidentId: row.incident_id,
    title: row.title,
    description: row.description,
    location: row.location,
    occurredTime: row.occurred_time,
    status: row.status as IncidentStatus,
    action: row.action as "created" | "updated",
    editedBy: { code: row.edited_by_code, name: row.edited_by_name || row.edited_by_code, position: row.edited_by_position },
    editedAt: row.edited_at
  }));
}
