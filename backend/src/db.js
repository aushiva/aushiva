import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, "..");
const dataDir = path.join(backendRoot, "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "aushiva.db");

let db;

export async function initDb() {
  if (db) return;
  fs.mkdirSync(dataDir, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(backendRoot, "node_modules", "sql.js", "dist", file)
  });

  const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  db = new SQL.Database(fileBuffer);
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      price REAL NOT NULL,
      status TEXT NOT NULL,
      excess INTEGER NOT NULL DEFAULT 0,
      reorderLevel INTEGER,
      UNIQUE(barcode, hospital)
    );

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
      declineReason TEXT NOT NULL DEFAULT "",
      declinedBy TEXT NOT NULL DEFAULT "[]"
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      hospital TEXT NOT NULL DEFAULT ""
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      hospital TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  ensureSchema();
  persistDb();
}

export function listMedicines() {
  return selectAll("SELECT * FROM medicines ORDER BY name ASC").map(normalizeMedicine);
}

export function getMedicineByBarcode(barcode) {
  const row = selectOne("SELECT * FROM medicines WHERE barcode = ?", [barcode]);
  return row ? normalizeMedicine(row) : null;
}

export function getMedicineByBarcodeAndHospital(barcode, hospital) {
  const row = selectOne("SELECT * FROM medicines WHERE barcode = ? AND hospital = ?", [barcode, hospital]);
  return row ? normalizeMedicine(row) : null;
}

export function createMedicine(medicine) {
  const payload = serializeMedicine(medicine);
  run(
    `INSERT INTO medicines (
      barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate,
      hospital, price, status, excess, reorderLevel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  persistDb();
  return getMedicineByBarcodeAndHospital(medicine.barcode, medicine.hospital);
}

export function updateMedicine(barcode, medicine, originalHospital) {
  const payload = serializeMedicine({ ...medicine, barcode });
  const lookupHospital = originalHospital || payload.hospital;
  run(
    `UPDATE medicines SET
      name = ?,
      batch = ?,
      manufacturer = ?,
      category = ?,
      quantity = ?,
      unit = ?,
      expiry = ?,
      manufacturingDate = ?,
      hospital = ?,
      price = ?,
      status = ?,
      excess = ?,
      reorderLevel = ?
    WHERE barcode = ? AND hospital = ?`,
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
  persistDb();
  return getMedicineByBarcodeAndHospital(payload.barcode, payload.hospital);
}

export function updateMedicineForHospital(barcode, hospital, updates) {
  const current = getMedicineByBarcodeAndHospital(barcode, hospital);
  if (!current) return null;
  const next = { ...current, ...updates, barcode, hospital };
  const payload = serializeMedicine(next);
  run(
    `UPDATE medicines SET
      name = ?,
      batch = ?,
      manufacturer = ?,
      category = ?,
      quantity = ?,
      unit = ?,
      expiry = ?,
      manufacturingDate = ?,
      hospital = ?,
      price = ?,
      status = ?,
      excess = ?,
      reorderLevel = ?
    WHERE barcode = ? AND hospital = ?`,
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
  persistDb();
  return getMedicineByBarcodeAndHospital(barcode, hospital);
}

export function deleteMedicine(barcode) {
  run("DELETE FROM medicines WHERE barcode = ?", [barcode]);
  persistDb();
}

export function deleteMedicineForHospital(barcode, hospital) {
  run("DELETE FROM medicines WHERE barcode = ? AND hospital = ?", [barcode, hospital]);
  persistDb();
}

export function replaceMedicines(medicines) {
  run("BEGIN TRANSACTION");
  try {
    run("DELETE FROM medicines");
    medicines.forEach((medicine) => {
      const payload = serializeMedicine(medicine);
      run(
        `INSERT INTO medicines (
          barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate,
          hospital, price, status, excess, reorderLevel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    });
    run("COMMIT");
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
  persistDb();
}

export function listExchangeRequests() {
  return selectAll("SELECT * FROM exchange_requests ORDER BY requestedAt DESC").map(normalizeRequest);
}

export function getExchangeRequest(id) {
  const row = selectOne("SELECT * FROM exchange_requests WHERE id = ?", [id]);
  return row ? normalizeRequest(row) : null;
}

export function createExchangeRequest(request) {
  run(
    `INSERT INTO exchange_requests (
      id, barcode, name, quantity, unit, fromHospital, targetHospital, status,
      direction, requestedAt, declineReason, declinedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  persistDb();
  return getExchangeRequest(request.id);
}

export function fulfillExchangeRequest(id, decision, actorHospital) {
  const current = getExchangeRequest(id);
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
    const updated = updateExchangeRequest(id, {
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
  const updated = updateExchangeRequest(id, {
    status: "Accepted",
    declineReason: "",
    targetHospital: offerHospital,
    declinedBy: []
  });
  return { ok: true, request: updated };
}

export function updateExchangeRequest(id, updates) {
  const current = getExchangeRequest(id);
  if (!current) return null;
  run(
    "UPDATE exchange_requests SET status = ?, declineReason = ?, declinedBy = ?, targetHospital = ? WHERE id = ?",
    [
      updates.status ?? current.status,
      updates.declineReason ?? current.declineReason ?? "",
      JSON.stringify(updates.declinedBy ?? current.declinedBy ?? []),
      updates.targetHospital ?? current.targetHospital,
      id
    ]
  );
  persistDb();
  return getExchangeRequest(id);
}

export function replaceExchangeRequests(requests) {
  run("BEGIN TRANSACTION");
  try {
    run("DELETE FROM exchange_requests");
    requests.forEach((request) => {
      run(
        `INSERT INTO exchange_requests (
          id, barcode, name, quantity, unit, fromHospital, targetHospital, status,
          direction, requestedAt, declineReason, declinedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    });
    run("COMMIT");
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
  persistDb();
}

export function countMedicines() {
  const row = selectOne("SELECT COUNT(1) as count FROM medicines");
  return row ? row.count : 0;
}

export function countExchangeRequests() {
  const row = selectOne("SELECT COUNT(1) as count FROM exchange_requests");
  return row ? row.count : 0;
}

export function getUserByEmail(email) {
  return selectOne("SELECT * FROM users WHERE email = ?", [email]);
}

export function ensureUser(user) {
  const existing = getUserByEmail(user.email);
  if (!existing) {
    run("INSERT INTO users (name, email, password, role, hospital) VALUES (?, ?, ?, ?, ?)", [
      user.name,
      user.email,
      user.password,
      user.role,
      user.hospital || ""
    ]);
    persistDb();
    return getUserByEmail(user.email);
  }
  if (!existing.hospital && user.hospital) {
    run("UPDATE users SET hospital = ? WHERE email = ?", [user.hospital, user.email]);
    persistDb();
    return getUserByEmail(user.email);
  }
  return existing;
}

export function updateUserHospital(email, hospital) {
  const existing = getUserByEmail(email);
  if (!existing) return null;
  run("UPDATE users SET hospital = ? WHERE email = ?", [hospital || "", email]);
  persistDb();
  return getUserByEmail(email);
}

export function updateUserPassword(email, password) {
  const existing = getUserByEmail(email);
  if (!existing) return null;
  run("UPDATE users SET password = ? WHERE email = ?", [password, email]);
  persistDb();
  return getUserByEmail(email);
}

export function migrateUserEmail(oldEmail, nextUser) {
  const existingOld = getUserByEmail(oldEmail);
  const existingNew = getUserByEmail(nextUser.email);
  if (!existingOld || existingNew) {
    return existingNew || existingOld;
  }
  run(
    "UPDATE users SET name = ?, email = ?, password = ?, role = ?, hospital = ? WHERE email = ?",
    [
      nextUser.name,
      nextUser.email,
      nextUser.password,
      nextUser.role,
      nextUser.hospital || "",
      oldEmail
    ]
  );
  persistDb();
  return getUserByEmail(nextUser.email);
}

export function createSession(session) {
  run("INSERT INTO sessions (id, email, name, role, hospital, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [
    session.id,
    session.email,
    session.name,
    session.role,
    session.hospital,
    session.createdAt
  ]);
  persistDb();
  return session;
}

export function getSession(sessionId) {
  return selectOne("SELECT * FROM sessions WHERE id = ?", [sessionId]);
}

export function deleteSession(sessionId) {
  run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  persistDb();
}

export function clearSessions() {
  run("DELETE FROM sessions");
  persistDb();
}

function selectAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function selectOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

function persistDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function ensureSchema() {
  const medicineIndex = selectAll("PRAGMA index_list(medicines)");
  const hasCompositeUnique = medicineIndex.some((idx) => {
    if (!idx.unique) return false;
    const columns = selectAll(`PRAGMA index_info(${idx.name})`).map((col) => col.name);
    return columns.length === 2 && columns.includes("barcode") && columns.includes("hospital");
  });
  if (!hasCompositeUnique) {
    run("BEGIN TRANSACTION");
    try {
      run(`
        CREATE TABLE IF NOT EXISTS medicines_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
          price REAL NOT NULL,
          status TEXT NOT NULL,
          excess INTEGER NOT NULL DEFAULT 0,
          reorderLevel INTEGER,
          UNIQUE(barcode, hospital)
        );
      `);
      run(`
        INSERT INTO medicines_new (id, barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate, hospital, price, status, excess, reorderLevel)
        SELECT id, barcode, name, batch, manufacturer, category, quantity, unit, expiry, manufacturingDate, hospital, price, status, excess, reorderLevel
        FROM medicines;
      `);
      run("DROP TABLE medicines");
      run("ALTER TABLE medicines_new RENAME TO medicines");
      run("COMMIT");
    } catch (error) {
      run("ROLLBACK");
      throw error;
    }
  }

  const userColumns = selectAll("PRAGMA table_info(users)").map((row) => row.name);
  if (!userColumns.includes("hospital")) {
    run("ALTER TABLE users ADD COLUMN hospital TEXT NOT NULL DEFAULT ''");
  }

  const sessionColumns = selectAll("PRAGMA table_info(sessions)").map((row) => row.name);
  if (!sessionColumns.includes("hospital")) {
    run("ALTER TABLE sessions ADD COLUMN hospital TEXT NOT NULL DEFAULT ''");
  }

  const exchangeColumns = selectAll("PRAGMA table_info(exchange_requests)").map((row) => row.name);
  if (!exchangeColumns.includes("declinedBy")) {
    run("ALTER TABLE exchange_requests ADD COLUMN declinedBy TEXT NOT NULL DEFAULT '[]'");
  }
}

function normalizeMedicine(row) {
  return {
    ...row,
    excess: Boolean(row.excess),
    reorderLevel: row.reorderLevel === null ? undefined : row.reorderLevel
  };
}

function serializeMedicine(medicine) {
  return {
    ...medicine,
    excess: medicine.excess ? 1 : 0,
    reorderLevel: Number.isFinite(medicine.reorderLevel) ? medicine.reorderLevel : null
  };
}

function normalizeRequest(row) {
  let declinedBy = [];
  try {
    declinedBy = row.declinedBy ? JSON.parse(row.declinedBy) : [];
  } catch {
    declinedBy = [];
  }
  return {
    ...row,
    declinedBy
  };
}
