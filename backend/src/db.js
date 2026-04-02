import pg from "pg";

const { Pool } = pg;

let pool;

export async function initDb() {
  if (pool) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to Postgres.");
  }

  const disableSsl = String(process.env.DATABASE_SSL || "").toLowerCase() === "false";

  pool = new Pool({
    connectionString,
    ssl: disableSsl ? false : { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medicines (
      id SERIAL PRIMARY KEY,
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      batch TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      expiry TEXT NOT NULL,
      manufacturingDate TEXT NOT NULL,
      hospital TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL,
      excess BOOLEAN NOT NULL DEFAULT FALSE,
      reorderLevel INTEGER,
      UNIQUE (barcode, hospital)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_requests (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      fromHospital TEXT NOT NULL,
      targetHospital TEXT NOT NULL,
      status TEXT NOT NULL,
      direction TEXT NOT NULL,
      requestedAt TEXT NOT NULL,
      declineReason TEXT NOT NULL DEFAULT '',
      declinedBy TEXT NOT NULL DEFAULT '[]'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      hospital TEXT NOT NULL DEFAULT ''
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      hospital TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS hospital TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hospital TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE exchange_requests ADD COLUMN IF NOT EXISTS declinedBy TEXT NOT NULL DEFAULT '[]'");
}

export async function listMedicines() {
  const { rows } = await pool.query("SELECT * FROM medicines ORDER BY name ASC");
  return rows.map(normalizeMedicine);
}

export async function getMedicineByBarcode(barcode) {
  const row = await selectOne("SELECT * FROM medicines WHERE barcode = $1", [barcode]);
  return row ? normalizeMedicine(row) : null;
}

export async function getMedicineByBarcodeAndHospital(barcode, hospital) {
  const row = await selectOne("SELECT * FROM medicines WHERE barcode = $1 AND hospital = $2", [barcode, hospital]);
  return row ? normalizeMedicine(row) : null;
}

export async function createMedicine(medicine) {
  const payload = serializeMedicine(medicine);
  const row = await selectOne(
    `INSERT INTO medicines (
      barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate,
      hospital, price, status, excess, reorderLevel
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      payload.barcode,
      payload.name,
      payload.batch,
      payload.manufacturer,
      payload.category,
      payload.quantity,
      payload.unit,
      payload.expiry,
      payload.manufacturingDate,
      payload.hospital,
      payload.price,
      payload.status,
      payload.excess,
      payload.reorderLevel
    ]
  );
  return row ? normalizeMedicine(row) : null;
}

export async function updateMedicine(barcode, medicine, originalHospital) {
  const payload = serializeMedicine({ ...medicine, barcode });
  const lookupHospital = originalHospital || payload.hospital;
  const row = await selectOne(
    `UPDATE medicines SET
      name = $1,
      batch = $2,
      manufacturer = $3,
      category = $4,
      quantity = $5,
      unit = $6,
      expiry = $7,
      manufacturingDate = $8,
      hospital = $9,
      price = $10,
      status = $11,
      excess = $12,
      reorderLevel = $13
    WHERE barcode = $14 AND hospital = $15
    RETURNING *`,
    [
      payload.name,
      payload.batch,
      payload.manufacturer,
      payload.category,
      payload.quantity,
      payload.unit,
      payload.expiry,
      payload.manufacturingDate,
      payload.hospital,
      payload.price,
      payload.status,
      payload.excess,
      payload.reorderLevel,
      payload.barcode,
      lookupHospital
    ]
  );
  return row ? normalizeMedicine(row) : null;
}

export async function updateMedicineForHospital(barcode, hospital, updates) {
  const current = await getMedicineByBarcodeAndHospital(barcode, hospital);
  if (!current) return null;
  const next = { ...current, ...updates, barcode, hospital };
  const payload = serializeMedicine(next);
  const row = await selectOne(
    `UPDATE medicines SET
      name = $1,
      batch = $2,
      manufacturer = $3,
      category = $4,
      quantity = $5,
      unit = $6,
      expiry = $7,
      manufacturingDate = $8,
      hospital = $9,
      price = $10,
      status = $11,
      excess = $12,
      reorderLevel = $13
    WHERE barcode = $14 AND hospital = $15
    RETURNING *`,
    [
      payload.name,
      payload.batch,
      payload.manufacturer,
      payload.category,
      payload.quantity,
      payload.unit,
      payload.expiry,
      payload.manufacturingDate,
      payload.hospital,
      payload.price,
      payload.status,
      payload.excess,
      payload.reorderLevel,
      payload.barcode,
      payload.hospital
    ]
  );
  return row ? normalizeMedicine(row) : null;
}

export async function deleteMedicine(barcode) {
  await pool.query("DELETE FROM medicines WHERE barcode = $1", [barcode]);
}

export async function deleteMedicineForHospital(barcode, hospital) {
  await pool.query("DELETE FROM medicines WHERE barcode = $1 AND hospital = $2", [barcode, hospital]);
}

export async function replaceMedicines(medicines) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM medicines");
    for (const medicine of medicines) {
      const payload = serializeMedicine(medicine);
      await client.query(
        `INSERT INTO medicines (
          barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate,
          hospital, price, status, excess, reorderLevel
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          payload.barcode,
          payload.name,
          payload.batch,
          payload.manufacturer,
          payload.category,
          payload.quantity,
          payload.unit,
          payload.expiry,
          payload.manufacturingDate,
          payload.hospital,
          payload.price,
          payload.status,
          payload.excess,
          payload.reorderLevel
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listExchangeRequests() {
  const { rows } = await pool.query("SELECT * FROM exchange_requests ORDER BY requestedAt DESC");
  return rows.map(normalizeRequest);
}

export async function getExchangeRequest(id) {
  const row = await selectOne("SELECT * FROM exchange_requests WHERE id = $1", [id]);
  return row ? normalizeRequest(row) : null;
}

export async function createExchangeRequest(request) {
  const row = await selectOne(
    `INSERT INTO exchange_requests (
      id, barcode, name, quantity, unit, fromHospital, targetHospital, status,
      direction, requestedAt, declineReason, declinedBy
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    [
      request.id,
      request.barcode,
      request.name,
      request.quantity,
      request.unit,
      request.fromHospital,
      request.targetHospital,
      request.status,
      request.direction,
      request.requestedAt,
      request.declineReason || "",
      JSON.stringify(request.declinedBy || [])
    ]
  );
  return row ? normalizeRequest(row) : null;
}

export async function fulfillExchangeRequest(id, decision, actorHospital) {
  const current = await getExchangeRequest(id);
  if (!current) return { ok: false, error: "Exchange request not found." };
  if (current.status !== "Pending") {
    return { ok: false, error: "Request already processed." };
  }

  if (decision.status === "Declined") {
    const declinedBy = new Set(current.declinedBy || []);
    if (actorHospital) {
      declinedBy.add(actorHospital);
    }
    const shouldFinalize = current.targetHospital !== "Any" && current.targetHospital === actorHospital;
    const updated = await updateExchangeRequest(id, {
      status: shouldFinalize ? "Declined" : "Pending",
      declineReason: decision.declineReason || current.declineReason || "",
      declinedBy: Array.from(declinedBy)
    });
    return { ok: true, request: updated };
  }

  if (decision.status !== "Accepted") {
    return { ok: false, error: "Invalid decision." };
  }

  const offerHospital = actorHospital || current.targetHospital;
  if (!offerHospital) {
    return { ok: false, error: "No hospital selected to fulfill the request." };
  }
  const updated = await updateExchangeRequest(id, {
    status: "Accepted",
    declineReason: "",
    targetHospital: offerHospital,
    declinedBy: []
  });
  return { ok: true, request: updated };
}

export async function updateExchangeRequest(id, updates) {
  const current = await getExchangeRequest(id);
  if (!current) return null;
  const row = await selectOne(
    "UPDATE exchange_requests SET status = $1, declineReason = $2, declinedBy = $3, targetHospital = $4 WHERE id = $5 RETURNING *",
    [
      updates.status ?? current.status,
      updates.declineReason ?? current.declineReason ?? "",
      JSON.stringify(updates.declinedBy ?? current.declinedBy ?? []),
      updates.targetHospital ?? current.targetHospital,
      id
    ]
  );
  return row ? normalizeRequest(row) : null;
}

export async function replaceExchangeRequests(requests) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM exchange_requests");
    for (const request of requests) {
      await client.query(
        `INSERT INTO exchange_requests (
          id, barcode, name, quantity, unit, fromHospital, targetHospital, status,
          direction, requestedAt, declineReason, declinedBy
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          request.id,
          request.barcode,
          request.name,
          request.quantity,
          request.unit,
          request.fromHospital,
          request.targetHospital,
          request.status,
          request.direction,
          request.requestedAt,
          request.declineReason || "",
          JSON.stringify(request.declinedBy || [])
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function countMedicines() {
  const row = await selectOne("SELECT COUNT(1)::int as count FROM medicines");
  return row ? row.count : 0;
}

export async function countExchangeRequests() {
  const row = await selectOne("SELECT COUNT(1)::int as count FROM exchange_requests");
  return row ? row.count : 0;
}

export async function getUserByEmail(email) {
  return selectOne("SELECT * FROM users WHERE email = $1", [email]);
}

export async function ensureUser(user) {
  const existing = await getUserByEmail(user.email);
  if (!existing) {
    await pool.query("INSERT INTO users (name, email, password, role, hospital) VALUES ($1,$2,$3,$4,$5)", [
      user.name,
      user.email,
      user.password,
      user.role,
      user.hospital || ""
    ]);
    return getUserByEmail(user.email);
  }
  if (!existing.hospital && user.hospital) {
    await pool.query("UPDATE users SET hospital = $1 WHERE email = $2", [user.hospital, user.email]);
    return getUserByEmail(user.email);
  }
  return existing;
}

export async function updateUserHospital(email, hospital) {
  const existing = await getUserByEmail(email);
  if (!existing) return null;
  await pool.query("UPDATE users SET hospital = $1 WHERE email = $2", [hospital || "", email]);
  return getUserByEmail(email);
}

export async function updateUserPassword(email, password) {
  const existing = await getUserByEmail(email);
  if (!existing) return null;
  await pool.query("UPDATE users SET password = $1 WHERE email = $2", [password, email]);
  return getUserByEmail(email);
}

export async function migrateUserEmail(oldEmail, nextUser) {
  const existingOld = await getUserByEmail(oldEmail);
  const existingNew = await getUserByEmail(nextUser.email);
  if (!existingOld || existingNew) {
    return existingNew || existingOld;
  }
  await pool.query(
    "UPDATE users SET name = $1, email = $2, password = $3, role = $4, hospital = $5 WHERE email = $6",
    [
      nextUser.name,
      nextUser.email,
      nextUser.password,
      nextUser.role,
      nextUser.hospital || "",
      oldEmail
    ]
  );
  return getUserByEmail(nextUser.email);
}

export async function createSession(session) {
  await pool.query("INSERT INTO sessions (id, email, name, role, hospital, createdAt) VALUES ($1,$2,$3,$4,$5,$6)", [
    session.id,
    session.email,
    session.name,
    session.role,
    session.hospital,
    session.createdAt
  ]);
  return session;
}

export async function getSession(sessionId) {
  return selectOne("SELECT * FROM sessions WHERE id = $1", [sessionId]);
}

export async function deleteSession(sessionId) {
  await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

export async function clearSessions() {
  await pool.query("DELETE FROM sessions");
}

async function selectOne(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

function normalizeMedicine(row) {
  const reorderLevel = row.reorderLevel ?? row.reorderlevel ?? null;
  const manufacturingDate = row.manufacturingDate ?? row.manufacturingdate ?? null;
  return {
    ...row,
    manufacturingDate,
    excess: Boolean(row.excess),
    reorderLevel: reorderLevel === null ? undefined : reorderLevel
  };
}

function serializeMedicine(medicine) {
  return {
    ...medicine,
    excess: Boolean(medicine.excess),
    reorderLevel: Number.isFinite(medicine.reorderLevel) ? medicine.reorderLevel : null
  };
}

function normalizeRequest(row) {
  let declinedBy = [];
  const declinedByRaw = row.declinedBy ?? row.declinedby ?? "[]";
  try {
    declinedBy = declinedByRaw ? JSON.parse(declinedByRaw) : [];
  } catch {
    declinedBy = [];
  }
  return {
    ...row,
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    fromHospital: row.fromHospital ?? row.fromhospital ?? "",
    targetHospital: row.targetHospital ?? row.targethospital ?? "",
    status: row.status,
    direction: row.direction,
    requestedAt: row.requestedAt ?? row.requestedat ?? "",
    declineReason: row.declineReason ?? row.declinereason ?? "",
    declinedBy
  };
}
