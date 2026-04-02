import crypto from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  clearSessions,
  createExchangeRequest,
  createMedicine,
  createSession,
  deleteMedicineForHospital,
  deleteSession,
  getExchangeRequest,
  getMedicineByBarcodeAndHospital,
  getSession,
  getUserByEmail,
  fulfillExchangeRequest,
  ensureUser,
  initDb,
  listExchangeRequests,
  listMedicines,
  replaceExchangeRequests,
  replaceMedicines,
  updateExchangeRequest,
  updateMedicine,
  updateUserPassword
} from "./db.js";
import { seedIfEmpty } from "./seed.js";

dotenv.config();

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const allowedOrigins = corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..", "..");
const staticDir = path.join(projectRoot, "dist");

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post(
  "/api/bootstrap",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    res.status(200).json({ ok: true });
  })
);

app.get(
  "/api/medicines",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    res.status(200).json(await listMedicines());
  })
);

app.post(
  "/api/medicines",
  asyncHandler(async (req, res) => {
    const medicine = req.body?.medicine || req.body;
    if (!medicine || !medicine.barcode || !medicine.hospital) {
      res.status(400).json({ error: "Medicine payload with barcode and hospital is required." });
      return;
    }
    const existing = await getMedicineByBarcodeAndHospital(medicine.barcode, medicine.hospital);
    if (existing) {
      res.status(409).json({ error: "Medicine with this barcode already exists." });
      return;
    }
    const created = await createMedicine(medicine);
    res.status(201).json(created);
  })
);

app.put(
  "/api/medicines",
  asyncHandler(async (req, res) => {
    const medicines = req.body?.medicines;
    if (!Array.isArray(medicines)) {
      res.status(400).json({ error: "Medicines array is required." });
      return;
    }
    await replaceMedicines(medicines);
    res.status(200).json(await listMedicines());
  })
);

app.put(
  "/api/medicines/:barcode",
  asyncHandler(async (req, res) => {
    const { barcode } = req.params;
    const medicine = req.body?.medicine || req.body;
    const hospital = medicine?.hospital;
    const originalHospital = medicine?.originalHospital || hospital;
    if (!hospital || !originalHospital) {
      res.status(400).json({ error: "Hospital is required to update a medicine." });
      return;
    }
    const existing = await getMedicineByBarcodeAndHospital(barcode, originalHospital);
    if (!existing) {
      res.status(404).json({ error: "Medicine not found." });
      return;
    }
    if (medicine.hospital !== originalHospital) {
      const conflict = await getMedicineByBarcodeAndHospital(barcode, medicine.hospital);
      if (conflict) {
        res.status(409).json({ error: "Medicine with this barcode already exists for the selected hospital." });
        return;
      }
    }
    const updated = await updateMedicine(barcode, medicine, originalHospital);
    res.status(200).json(updated);
  })
);

app.delete(
  "/api/medicines/:barcode",
  asyncHandler(async (req, res) => {
    const { barcode } = req.params;
    const hospital = req.query?.hospital;
    if (!hospital) {
      res.status(400).json({ error: "Hospital is required to delete a medicine." });
      return;
    }
    const existing = await getMedicineByBarcodeAndHospital(barcode, hospital);
    if (!existing) {
      res.status(404).json({ error: "Medicine not found." });
      return;
    }
    await deleteMedicineForHospital(barcode, hospital);
    res.status(204).end();
  })
);

app.get(
  "/api/exchange-requests",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    res.status(200).json(await listExchangeRequests());
  })
);

app.post(
  "/api/exchange-requests",
  asyncHandler(async (req, res) => {
    const request = req.body?.request || req.body;
    if (!request) {
      res.status(400).json({ error: "Exchange request payload is required." });
      return;
    }
    const id = request.id || `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const created = await createExchangeRequest({ ...request, id });
    res.status(201).json(created);
  })
);

app.put(
  "/api/exchange-requests",
  asyncHandler(async (req, res) => {
    const requests = req.body?.requests;
    if (!Array.isArray(requests)) {
      res.status(400).json({ error: "Exchange requests array is required." });
      return;
    }
    await replaceExchangeRequests(requests);
    res.status(200).json(await listExchangeRequests());
  })
);

app.put(
  "/api/exchange-requests/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!(await getExchangeRequest(id))) {
      res.status(404).json({ error: "Exchange request not found." });
      return;
    }
    const updated = await updateExchangeRequest(id, req.body || {});
    res.status(200).json(updated);
  })
);

app.post(
  "/api/exchange-requests/:id/decision",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, declineReason, hospital } = req.body || {};
    const result = await fulfillExchangeRequest(id, { status, declineReason }, hospital);
    if (!result.ok) {
      res.status(400).json({ ok: false, message: result.error });
      return;
    }
    res.status(200).json({
      ok: true,
      request: result.request,
      medicines: await listMedicines(),
      requests: await listExchangeRequests()
    });
  })
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    const { email, password } = req.body || {};
    const user = email ? await getUserByEmail(email) : null;
    if (!user || user.password !== password) {
      res.status(401).json({ ok: false, message: "Invalid email or password" });
      return;
    }

    const session = {
      id: crypto.randomUUID(),
      email: user.email,
      name: user.name,
      role: user.role,
      hospital: user.hospital || "",
      createdAt: new Date().toISOString()
    };
    await createSession(session);
    res.cookie("aushiva_session", session.id, { httpOnly: true, sameSite: "lax" });
    res.status(200).json({
      ok: true,
      session: { email: user.email, name: user.name, role: user.role, hospital: user.hospital || "" }
    });
  })
);

app.post(
  "/api/signup",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    const { name, email, password, hospital } = req.body || {};
    if (!name || !email || !password || !hospital) {
      res.status(400).json({ ok: false, message: "Name, email, password, and hospital are required." });
      return;
    }
    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ ok: false, message: "An account with this email already exists." });
      return;
    }
    await ensureUser({ name, email, password, role: "Inventory Manager", hospital });
    res.status(201).json({
      ok: true,
      message: "Account created. Please sign in with your Gmail and password."
    });
  })
);

app.post(
  "/api/reset-password",
  asyncHandler(async (req, res) => {
    await seedIfEmpty();
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ ok: false, message: "Email and new password are required." });
      return;
    }
    const updated = await updateUserPassword(email, password);
    if (!updated) {
      res.status(404).json({ ok: false, message: "No account found with this email." });
      return;
    }
    res.status(200).json({ ok: true, message: "Password updated. Please sign in." });
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (req, res) => {
    const sessionId = req.cookies?.aushiva_session;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.clearCookie("aushiva_session");
    res.status(200).json({ ok: true });
  })
);

app.get(
  "/api/session",
  asyncHandler(async (req, res) => {
    const sessionId = req.cookies?.aushiva_session;
    if (!sessionId) {
      res.status(200).json(null);
      return;
    }
    const session = await getSession(sessionId);
    if (!session) {
      res.clearCookie("aushiva_session");
      res.status(200).json(null);
      return;
    }
    res.status(200).json({ email: session.email, name: session.name, role: session.role, hospital: session.hospital || "" });
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(staticDir));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });
}

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 5050;

await initDb();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
