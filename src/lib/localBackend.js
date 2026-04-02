import { seedExchangeRequests, seedMedicines, seedUser } from "../data/seed";

const STORAGE_KEYS = {
  medicines: "aushiva.medicines",
  session: "aushiva.session",
  user: "aushiva.user",
  seedVersion: "aushiva.seedVersion",
  exchangeRequests: "aushiva.exchangeRequests"
};
const CURRENT_SEED_VERSION = "csv-2026-03-27-hospital-cleanup";

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function bootstrapLocalBackend() {
  const storedVersion = window.localStorage.getItem(STORAGE_KEYS.seedVersion);
  const needsReset = !window.localStorage.getItem(STORAGE_KEYS.medicines) || storedVersion !== CURRENT_SEED_VERSION;
  if (needsReset) {
    writeJson(STORAGE_KEYS.medicines, seedMedicines);
    window.localStorage.setItem(STORAGE_KEYS.seedVersion, CURRENT_SEED_VERSION);
  }
  const storedUser = readJson(STORAGE_KEYS.user, null);
  if (!storedUser || storedUser.email !== seedUser.email) {
    writeJson(STORAGE_KEYS.user, seedUser);
  }
  const storedSession = readJson(STORAGE_KEYS.session, null);
  if (storedSession && storedSession.email !== seedUser.email) {
    window.localStorage.removeItem(STORAGE_KEYS.session);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.exchangeRequests)) {
    writeJson(STORAGE_KEYS.exchangeRequests, seedExchangeRequests);
  }
}

export function getMedicines() {
  return readJson(STORAGE_KEYS.medicines, seedMedicines);
}

export function saveMedicines(medicines) {
  writeJson(STORAGE_KEYS.medicines, medicines);
  return medicines;
}

export function login(email, password) {
  const user = readJson(STORAGE_KEYS.user, seedUser);
  if (email === user.email && password === user.password) {
    const session = {
      email: user.email,
      name: user.name,
      role: user.role,
      hospital: user.hospital || "",
      loggedInAt: new Date().toISOString()
    };
    writeJson(STORAGE_KEYS.session, session);
    return { ok: true, session };
  }
  return { ok: false, message: "Invalid email or password" };
}

export function logout() {
  window.localStorage.removeItem(STORAGE_KEYS.session);
}

export function getSession() {
  return readJson(STORAGE_KEYS.session, null);
}

export function getExchangeRequests() {
  const current = readJson(STORAGE_KEYS.exchangeRequests, seedExchangeRequests);
  if (Array.isArray(current) && current.length === 0) {
    writeJson(STORAGE_KEYS.exchangeRequests, seedExchangeRequests);
    return seedExchangeRequests;
  }
  const session = readJson(STORAGE_KEYS.session, null);
  const currentHospital = session?.hospital || seedUser.hospital;
  const hasIncoming = Array.isArray(current) && current.some((request) => request.fromHospital !== currentHospital);
  if (!hasIncoming) {
    const incomingSeeds = seedExchangeRequests.filter((request) => request.fromHospital !== currentHospital);
    const byId = new Map(current.map((request) => [request.id, request]));
    incomingSeeds.forEach((request) => {
      if (!byId.has(request.id)) {
        byId.set(request.id, request);
      }
    });
    const merged = Array.from(byId.values());
    writeJson(STORAGE_KEYS.exchangeRequests, merged);
    return merged;
  }
  return current;
}

export function saveExchangeRequests(requests) {
  writeJson(STORAGE_KEYS.exchangeRequests, requests);
  return requests;
}
