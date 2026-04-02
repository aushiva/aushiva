import { useEffect, useMemo, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import logo from "./assets/logo.png";
import loginLogoFull from "./assets/login-logo-full.png";
import {
  bootstrapBackend,
  createExchangeRequest,
  createMedicine,
  deleteMedicine as deleteMedicineRemote,
  getExchangeRequests,
  getMedicines,
  getSession,
  login,
  logout,
  resetPassword,
  saveMedicines,
  signup,
  decideExchangeRequest,
  updateExchangeRequest,
  updateMedicine as updateMedicineRemote
} from "./lib/backend";
import {
  categories,
  categoryColors,
  demandForecast,
  departments,
  hospitals,
  navItems,
  usageData
} from "./data/seed";

function buildDefaultForm(activeHospital) {
  return {
    name: "",
    barcode: "",
    batch: "",
    manufacturer: "",
    category: "Other",
    quantity: 0,
    unit: "tablets",
    expiry: "2026-04-30",
    manufacturingDate: "2024-04-30",
    hospital: activeHospital || hospitals[0],
    price: 0,
    status: "Active",
    excess: false
  };
}

function daysUntil(dateString) {
  const today = new Date();
  const expiry = new Date(`${dateString}T00:00:00`);
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function deriveManufacturingDate(expiry) {
  const expiryDate = new Date(`${expiry}T00:00:00`);
  const manufacturingDate = new Date(expiryDate);
  manufacturingDate.setFullYear(manufacturingDate.getFullYear() - 2);
  return manufacturingDate.toISOString().slice(0, 10);
}

function resolveManufacturingDate(item) {
  return item.manufacturingDate || deriveManufacturingDate(item.expiry);
}

function expiryState(item) {
  const days = daysUntil(item.expiry);
  if (days < 0) return { type: "expired", label: "Expired", detail: `${Math.abs(days)}d overdue` };
  if (days < 7) return { type: "warning", label: `${days}d left`, detail: "Critical" };
  if (days <= 30) return { type: "warning", label: `${days}d left`, detail: "Expiring Soon" };
  return { type: "safe", label: "Valid", detail: "Safe" };
}

function normalizeMedicineStatus(item) {
  const expired = daysUntil(item.expiry) < 0;
  if (!expired) return item;
  if (item.status === "Expired") return item;
  return { ...item, status: "Expired" };
}

function normalizeMedicines(items) {
  const base = Date.now();
  return items.map((item, index) => {
    const normalized = normalizeMedicineStatus(item);
    if (normalized.addedAt) {
      return normalized;
    }
    return { ...normalized, addedAt: base - index };
  });
}


function isExpired(item) {
  return daysUntil(item.expiry) < 0;
}

function stripExpired(items) {
  return items.filter((item) => !isExpired(item));
}

function sanitizeMedicines(items) {
  return normalizeMedicines(stripExpired(items));
}

function dateKey(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function expiryPriority(item) {
  const days = daysUntil(item.expiry);
  if (days < 0) return { rank: days, label: "Expired", type: "expired", detail: `${Math.abs(days)}d overdue` };
  if (days < 7) return { rank: days, label: "Critical", type: "warning", detail: `${days}d left` };
  if (days <= 30) return { rank: days, label: "Expiring Soon", type: "warning", detail: `${days}d left` };
  return { rank: days, label: "Valid", type: "safe", detail: `${days}d left` };
}

function stockState(item) {
  const reorderLevel = Number.isFinite(item.reorderLevel) ? item.reorderLevel : 20;
  return item.quantity <= reorderLevel ? "Low Stock" : "In Stock";
}

function formatRequestTime(dateString) {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function requestStatusTone(status) {
  if (status === "Accepted") return "safe";
  if (status === "Partially Accepted") return "warning";
  if (status === "Declined") return "expired";
  return "warning";
}

function compareValues(a, b, dir = "asc") {
  const left = a ?? "";
  const right = b ?? "";
  if (typeof left === "number" && typeof right === "number") {
    return dir === "asc" ? left - right : right - left;
  }
  const result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function getAddedAtValue(item) {
  if (!item) return 0;
  const value = item.addedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

  function matchesQuery(values, query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const tokens = normalizedQuery.split(" ").filter(Boolean);
    return values.some((value) => {
      const text = normalizeSearchText(value);
      return tokens.every((token) => text.includes(token));
    });
  }

  function exchangeActionRank(item, existingRequest, isOwnListing) {
    if (isOwnListing) return 0; // Your Listing
    if (existingRequest) return 1; // Requested
    return 2; // Request Transfer
  }

function sortByRecent(rows) {
  return [...rows].sort((a, b) => getAddedAtValue(b) - getAddedAtValue(a));
}

function sortRows(rows, sort, getter) {
  if (!sort.key) return rows;
  return [...rows].sort((a, b) => compareValues(getter(a, sort.key), getter(b, sort.key), sort.dir));
}

function SortLabel({ label, activeKey, activeDir, onAsc, onDesc, sortKey }) {
  const ascActive = activeKey === sortKey && activeDir === "asc";
  const descActive = activeKey === sortKey && activeDir === "desc";
  return (
    <span className="sortable">
      {label}
      <span className="sort-controls">
        <button type="button" className={`sort-btn ${ascActive ? "active" : ""}`} onClick={onAsc.fn} aria-label={`Sort ${label} ascending`}>&#9650;</button>
        <button type="button" className={`sort-btn ${descActive ? "active" : ""}`} onClick={onDesc.fn} aria-label={`Sort ${label} descending`}>&#9660;</button>
      </span>
    </span>
  );
}

function BarChart({ data }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-item" key={item.label}>
          <div className="bar-value">{item.value}</div>
          <div className="bar" style={{ height: `${(item.value / max) * 180 + 24}px` }} />
          <div className="bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function LoginScreen({ mode, onLogin, onSignup, onResetPassword, errorMessage, onToggleMode, onForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [hospital, setHospital] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpStatus, setOtpStatus] = useState("idle");
  const [otpMessage, setOtpMessage] = useState("");
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const otpRef = useRef(null);
  const otpIssuedAtRef = useRef(0);

  const emailjsConfig = useMemo(() => ({
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
    templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  }), []);

  useEffect(() => {
    if (mode === "login") {
      setEmail("");
      setPassword("");
    } else {
      setEmail("");
      setPassword("");
    }
    setConfirmPassword("");
    setOtpInput("");
    setOtpStatus("idle");
    setOtpMessage("");
    setOtpCooldownUntil(0);
    otpRef.current = null;
    otpIssuedAtRef.current = 0;
  }, [mode]);

  useEffect(() => {
    if (mode !== "signup" && mode !== "reset") return;
    setOtpInput("");
    setOtpStatus("idle");
    setOtpMessage("");
    setOtpCooldownUntil(0);
    otpRef.current = null;
    otpIssuedAtRef.current = 0;
  }, [email, mode]);

  const isGmailAddress = (value) => /@gmail\.com$/i.test(value.trim());
  const canSendOtp = (mode === "signup" || mode === "reset")
    && email
    && isGmailAddress(email)
    && Date.now() >= otpCooldownUntil;

  async function sendOtp() {
    if (!isGmailAddress(email)) {
      setOtpMessage("Please use a valid Gmail address to sign up.");
      setOtpStatus("error");
      return;
    }
    if (!emailjsConfig.serviceId || !emailjsConfig.templateId || !emailjsConfig.publicKey) {
      setOtpMessage("Email service is not configured yet. Add EmailJS keys to continue.");
      setOtpStatus("error");
      return;
    }
    if (Date.now() < otpCooldownUntil) {
      return;
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    otpRef.current = code;
    otpIssuedAtRef.current = Date.now();
    setOtpStatus("sending");
    setOtpMessage("");

    try {
      await emailjs.send(
        emailjsConfig.serviceId,
        emailjsConfig.templateId,
        {
          to_email: email,
          to_name: name?.trim() || "Aushiva User",
          otp_code: code
        },
        emailjsConfig.publicKey
      );
      setOtpStatus("sent");
      setOtpMessage("OTP sent to your Gmail. It will expire in 10 minutes.");
      setOtpCooldownUntil(Date.now() + 30000);
    } catch (error) {
      setOtpStatus("error");
      setOtpMessage("Failed to send OTP. Please try again.");
    }
  }

  function verifyOtp() {
    if (!otpRef.current) {
      setOtpStatus("error");
      setOtpMessage("Request a new OTP before verifying.");
      return;
    }
    const ageMs = Date.now() - otpIssuedAtRef.current;
    if (ageMs > 10 * 60 * 1000) {
      setOtpStatus("error");
      setOtpMessage("OTP expired. Please request a new one.");
      return;
    }
    if (otpInput.trim() !== otpRef.current) {
      setOtpStatus("error");
      setOtpMessage("OTP does not match. Please check the code.");
      return;
    }
    setOtpStatus("verified");
    setOtpMessage("Gmail verified. You can create your account.");
  }

  function submit(event) {
    event.preventDefault();
    if (mode === "signup") {
      if (otpStatus !== "verified") {
        setOtpMessage("Verify your Gmail with OTP before creating the account.");
        setOtpStatus("error");
        return;
      }
      const accountName = name.trim() || email.trim() || email;
      onSignup({ name: accountName, email, password, hospital });
      return;
    }
    if (mode === "reset") {
      if (otpStatus !== "verified") {
        setOtpMessage("Verify your Gmail with OTP before resetting the password.");
        setOtpStatus("error");
        return;
      }
      if (!password || password !== confirmPassword) {
        setOtpMessage("Passwords do not match.");
        setOtpStatus("error");
        return;
      }
      onResetPassword({ email, password });
      return;
    }
    onLogin(email, password);
  }

  return (
    <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-brand">
            <div className="auth-top-logo">
              <img src={logo} alt="Aushiva Logo" />
            </div>
            <h1><strong>AUSHIVA</strong></h1>
            <p>Hospital Management System</p>
          </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" ? (
            <>
              <label>
                <span className="auth-icon">&#127973;</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  type="text"
                  placeholder="Hospital Admin Name"
                  required
                />
              </label>
              <label>
                <span className="auth-icon">&#127976;</span>
                <input
                  value={hospital}
                  onChange={(event) => setHospital(event.target.value)}
                  type="text"
                  placeholder="Hospital Name"
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            <span className="auth-icon">&#128100;</span>
            <input 
              value={email} 
              onChange={(event) => setEmail(event.target.value)} 
              type="email" 
              placeholder="Gmail Address"
              required 
            />
          </label>
          {(mode === "signup" || mode === "reset") ? (
            <>
              <div className="auth-otp-row">
                <button
                  type="button"
                  className="auth-otp-btn"
                  onClick={sendOtp}
                  disabled={!canSendOtp || otpStatus === "sending"}
                >
                  {otpStatus === "sending" ? "Sending..." : "Send OTP"}
                </button>
                <span className={`auth-otp-pill auth-otp-${otpStatus}`}>
                  {otpStatus === "verified" ? "Verified" : "Gmail OTP"}
                </span>
              </div>
              <label>
                <span className="auth-icon">&#128273;</span>
                <input
                  value={otpInput}
                  onChange={(event) => setOtpInput(event.target.value)}
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter OTP"
                />
              </label>
              <button
                type="button"
                className="auth-otp-verify"
                onClick={verifyOtp}
                disabled={!otpInput || otpStatus === "sending"}
              >
                Verify OTP
              </button>
            </>
          ) : null}
          <label>
            <span className="auth-icon">&#128274;</span>
            <div className="auth-password-field">
              <input 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                type={showPassword ? "text" : "password"} 
                placeholder={mode === "reset" ? "New Password" : "Password"}
                required 
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                data-state={showPassword ? "shown" : "hidden"}
              >
                {"\u{1F441}"}
              </button>
            </div>
          </label>
          {mode === "reset" ? (
            <label>
              <span className="auth-icon">&#128274;</span>
              <div className="auth-password-field">
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm New Password"
                  required
                />
              </div>
            </label>
          ) : null}
          
          <div className="auth-options">
            {mode === "login" ? (
              <button type="button" className="forgot-password" onClick={onForgot}>Forgot Password?</button>
            ) : null}
          </div>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          {otpMessage && (mode === "signup" || mode === "reset") ? <p className="auth-otp-message">{otpMessage}</p> : null}
          
          <button
            type="submit"
            className="auth-btn"
            disabled={(mode === "signup" || mode === "reset") && otpStatus !== "verified"}
          >
            {mode === "signup" ? "CREATE ACCOUNT" : mode === "reset" ? "RESET PASSWORD" : "SIGN IN"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "reset" ? (
            <>
              <p>Remembered your password?</p>
              <button type="button" className="auth-signup-link" onClick={onToggleMode}>
                Back to Sign In
              </button>
            </>
          ) : (
            <>
              <p>{mode === "signup" ? "Already have an account?" : "Don't have an account?"}</p>
              <button type="button" className="auth-signup-link" onClick={onToggleMode}>
                {mode === "signup" ? "Back to Sign In" : "Sign Up"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MedicineModal({ open, onClose, onSubmit, initialValues }) {
  const [form, setForm] = useState(initialValues);

  useEffect(() => {
    if (!open) return;
    setForm(initialValues);
  }, [initialValues, open]);

  if (!open) return null;

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function submit(event) {
    event.preventDefault();
    const manufacturingDate = resolveManufacturingDate(form);
    const reorderLevel = form.reorderLevel === undefined ? undefined : Number(form.reorderLevel);

    onSubmit({
      ...form,
      quantity: Number(form.quantity),
      ...(reorderLevel === undefined ? {} : { reorderLevel }),
      manufacturingDate,
      price: Number(form.price)
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h3>{initialValues.barcode ? "Edit Medicine" : "Add Medicine"}</h3>
          <button className="icon-btn" onClick={onClose} type="button">x</button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label><span>Medicine Name</span><input name="name" value={form.name} onChange={updateField} required /></label>
          <label><span>Barcode</span><input name="barcode" value={form.barcode} onChange={updateField} required disabled={Boolean(initialValues.barcode)} /></label>
          <label><span>Batch Number</span><input name="batch" value={form.batch} onChange={updateField} required /></label>
          <label><span>Manufacturer</span><input name="manufacturer" value={form.manufacturer} onChange={updateField} required /></label>
          <label><span>Category</span><select name="category" value={form.category} onChange={updateField}>{categories.filter((item) => item !== "All Categories").map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Quantity</span><input name="quantity" type="number" min="0" value={form.quantity} onChange={updateField} required /></label>
          <label><span>Unit</span><select name="unit" value={form.unit} onChange={updateField}>{["tablets", "capsules", "bottles", "tubes", "vials"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Manufacturing Date</span><input name="manufacturingDate" type="date" value={form.manufacturingDate} onChange={updateField} required /></label>
          <label><span>Expiry Date</span><input name="expiry" type="date" value={form.expiry} onChange={updateField} required /></label>
          <label>
            <span>Hospital</span>
            <input
              name="hospital"
              value={form.hospital}
              onChange={updateField}
              list="hospital-options"
              placeholder="Select or type a hospital"
              required
            />
            <datalist id="hospital-options">
              {hospitals.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>
          <label><span>Price Per Unit</span><input name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateField} required /></label>
          <label><span>Status</span><select name="status" value={form.status} onChange={updateField}><option>Active</option><option>Inactive</option></select></label>
          <label className="toggle-row"><input name="excess" type="checkbox" checked={form.excess} onChange={updateField} /><span>Mark as Excess Stock (available for sharing)</span></label>
          <div className="form-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn">Save Medicine</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [activeView, setActiveView] = useState("dashboard");
  const [medicines, setMedicines] = useState([]);
  const [inventorySearchInput, setInventorySearchInput] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("All Categories");
  const [inventorySort, setInventorySort] = useState({ key: null, dir: "asc" });
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(50);
  const [alertsSearch, setAlertsSearch] = useState("");
  const [alertsFilter, setAlertsFilter] = useState("all");
  const [alertsSort, setAlertsSort] = useState({ key: null, dir: "asc" });
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState(null);
  const scanInputRef = useRef(null);
  const scanTimerRef = useRef(null);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [exchangeAddMode, setExchangeAddMode] = useState(false);
  const [exchangeRequests, setExchangeRequests] = useState([]);
  const [declineTargetId, setDeclineTargetId] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [exchangeActionError, setExchangeActionError] = useState("");
  const [requestTarget, setRequestTarget] = useState(null);
  const [requestQuantity, setRequestQuantity] = useState(1);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState("pending");
  const [submittedStatusFilter, setSubmittedStatusFilter] = useState("pending");
  const [exchangeSort, setExchangeSort] = useState({ key: null, dir: "asc" });
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [removedTodayCount, setRemovedTodayCount] = useState(0);
  const [removedTodayKey, setRemovedTodayKey] = useState(dateKey());
  const [showRemovalDetail, setShowRemovalDetail] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      await bootstrapBackend();
      const [sessionValue, medicinesValue, requestsValue] = await Promise.all([
        getSession(),
        getMedicines(),
        getExchangeRequests()
      ]);

      if (!alive) return;
      setSession(sessionValue);
      const cleanedMedicines = applyMedicineCleanup(medicinesValue, { persist: true });
      setMedicines(cleanedMedicines);
      setExchangeRequests(requestsValue);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (activeView !== "exchange") return;
    let alive = true;
    const poll = async () => {
      try {
        const [meds, requests] = await Promise.all([getMedicines(), getExchangeRequests()]);
        if (!alive) return;
        setMedicines(applyMedicineCleanup(meds, { countRemoved: false }));
        setExchangeRequests(requests);
      } catch {
        // ignore polling errors
      }
    };
    const id = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activeView]);

  useEffect(() => {
    let alive = true;
    let intervalId = null;
    let timeoutId = null;

    const prune = () => {
      if (!alive) return;
      setRemovedTodayKey((currentKey) => {
        const todayKey = dateKey();
        if (currentKey !== todayKey) {
          setRemovedTodayCount(0);
          setShowRemovalDetail(false);
          return todayKey;
        }
        return currentKey;
      });
      setMedicines((current) => applyMedicineCleanup(current, { persist: true }));
    };

    const scheduleMidnightPurge = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const delay = Math.max(0, nextMidnight - now);
      timeoutId = setTimeout(() => {
        prune();
        intervalId = setInterval(prune, 24 * 60 * 60 * 1000);
      }, delay);
    };

    prune();
    scheduleMidnightPurge();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!showRemovalDetail) return;
    const id = setTimeout(() => setShowRemovalDetail(false), 4000);
    return () => clearTimeout(id);
  }, [showRemovalDetail]);

  const counts = useMemo(() => medicines.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {}), [medicines]);

  const donutStyle = useMemo(() => {
    const total = medicines.length || 1;
    let start = 0;
    const segments = Object.entries(counts).map(([name, count]) => {
      const size = (count / total) * 360;
      const color = categoryColors[name] || "#94a3b8";
      const part = `${color} ${start}deg ${start + size}deg`;
      start += size;
      return part;
    });
    return { background: `conic-gradient(${segments.join(",")})` };
  }, [counts, medicines.length]);

  const activeHospital = session?.hospital || hospitals[0];

  useEffect(() => {
    const timer = setTimeout(() => {
      setInventorySearch(inventorySearchInput);
      setInventoryPage(1);
    }, 180);
    return () => clearTimeout(timer);
  }, [inventorySearchInput]);

  const inventoryRows = useMemo(() => {
    const filtered = medicines.filter((item) => {
      const matchesSearch = matchesQuery([item.name, item.barcode, item.manufacturer], inventorySearch);
      const matchesCategory = inventoryCategory === "All Categories" || item.category === inventoryCategory;
      return matchesSearch && matchesCategory;
    });

    const ordered = inventorySort.key ? sortRows(filtered, inventorySort, (item, key) => {
      switch (key) {
        case "name":
          return item.name;
        case "barcode":
          return item.barcode;
        case "batch":
          return item.batch;
        case "manufacturer":
          return item.manufacturer;
        case "quantity":
          return item.quantity;
        case "stock":
          return stockState(item);
        case "manufacturingDate":
          return resolveManufacturingDate(item);
        case "expiry":
          return item.expiry;
        default:
          return "";
      }
    }) : sortByRecent(filtered);

    return ordered;
  }, [inventoryCategory, inventorySearch, medicines, inventorySort]);

  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryRows.length / inventoryPageSize));
  const inventoryPageClamped = Math.min(inventoryPage, inventoryTotalPages);
  const inventoryPageRows = useMemo(() => {
    const start = (inventoryPageClamped - 1) * inventoryPageSize;
    return inventoryRows.slice(start, start + inventoryPageSize);
  }, [inventoryPageClamped, inventoryPageSize, inventoryRows]);

  const alertRows = useMemo(() => {
    const filtered = medicines.filter((item) => {
      const days = daysUntil(item.expiry);
      const status = expiryState(item);
      const matchesSearch = item.name.toLowerCase().includes(alertsSearch.toLowerCase());
      const matchesFilter =
        alertsFilter === "all" ||
        (alertsFilter === "expired" && status.type === "expired") ||
        (alertsFilter === "critical" && days >= 0 && days < 7) ||
        (alertsFilter === "warning" && days >= 7 && days <= 30);
      return matchesSearch && matchesFilter && days <= 30;
    });

    if (!alertsSort.key) {
      return sortByRecent(filtered);
    }

    return sortRows(filtered, alertsSort, (item, key) => {
      switch (key) {
        case "name":
          return item.name;
        case "barcode":
          return item.barcode;
        case "batch":
          return item.batch;
        case "quantity":
          return item.quantity;
        case "manufacturingDate":
          return resolveManufacturingDate(item);
        case "expiry":
          return item.expiry;
        case "status":
          return expiryState(item).label;
        case "hospital":
          return item.hospital;
        default:
          return "";
      }
    });
  }, [alertsFilter, alertsSearch, medicines, alertsSort]);


  const exchangeListings = useMemo(() => {
    const filtered = medicines.filter((item) => {
      const priority = expiryPriority(item);
      const critical = priority.label === "Critical";
      const expiringSoon = priority.label === "Expiring Soon";
      const matchesSearch = matchesQuery(
        [item.name, item.barcode, item.batch, item.category, item.hospital],
        exchangeSearch
      );
      const isOwnHospital = item.hospital === activeHospital;
      const eligible = (item.excess || critical || expiringSoon) && (!isOwnHospital || item.excess);
      return eligible && matchesSearch;
    });
    if (!exchangeSort.key) {
      return sortByRecent(filtered);
    }
    return sortRows(filtered, exchangeSort, (item, key) => {
      switch (key) {
        case "name":
          return item.name;
        case "category":
          return item.category;
        case "quantity":
          return item.quantity;
        case "manufacturingDate":
          return resolveManufacturingDate(item);
        case "expiry":
          return item.expiry;
        case "hospital":
          return item.hospital;
        case "priority":
          return expiryPriority(item).rank;
        case "action": {
          const isOwnListing = item.hospital === activeHospital;
          const existingRequest = exchangeRequests.find((request) =>
            request.direction === "submitted" &&
            request.barcode === item.barcode &&
            request.fromHospital === activeHospital &&
            request.status === "Pending"
          );
          return exchangeActionRank(item, existingRequest, isOwnListing);
        }
        default:
          return "";
      }
    });
  }, [activeHospital, medicines, exchangeSearch, exchangeSort]);

  const approvalPool = useMemo(
    () => exchangeRequests.filter((request) => {
      if (request.fromHospital === activeHospital) return false;
      if (request.targetHospital !== activeHospital && request.targetHospital !== "Any") return false;
      return true;
    }),
    [exchangeRequests, activeHospital]
  );
  const deriveApprovalStatus = useMemo(() => (request) => {
    if (request.status === "Declined") return "Declined";
    if (Array.isArray(request.declinedBy) && request.declinedBy.includes(activeHospital)) return "Declined";
    return request.status;
  }, [activeHospital]);
  const incomingRequestCounts = useMemo(() => ({
    pending: approvalPool.filter((request) => deriveApprovalStatus(request) === "Pending").length,
    accepted: approvalPool.filter((request) => deriveApprovalStatus(request) === "Accepted").length,
    declined: approvalPool.filter((request) => deriveApprovalStatus(request) === "Declined").length
  }), [approvalPool, deriveApprovalStatus]);
  const filteredIncomingRequests = useMemo(() => {
    if (approvalStatusFilter === "all") {
      return approvalPool;
    }

    const statusMap = {
      pending: "Pending",
      accepted: "Accepted",
      declined: "Declined"
    };

    return approvalPool.filter((request) => deriveApprovalStatus(request) === statusMap[approvalStatusFilter]);
  }, [approvalPool, approvalStatusFilter, deriveApprovalStatus]);

  const approvalsGrouped = useMemo(() => ({
    pending: filteredIncomingRequests.filter((request) => deriveApprovalStatus(request) === "Pending"),
    accepted: filteredIncomingRequests.filter((request) => deriveApprovalStatus(request) === "Accepted"),
    declined: filteredIncomingRequests.filter((request) => deriveApprovalStatus(request) === "Declined")
  }), [filteredIncomingRequests, deriveApprovalStatus]);

  function renderApprovalSection(title, rows) {
    if (!rows.length) return null;
    return (
      <>
        <tr className="section-row">
          <td colSpan={9}>
            <span className="section-pill">{title}</span>
          </td>
        </tr>
        {rows.map((request) => {
          const displayStatus = deriveApprovalStatus(request);
          return (
          <tr key={request.id}>
            <td>{request.name}</td>
            <td>{request.barcode}</td>
            <td>{request.fromHospital}</td>
            <td>{request.targetHospital}</td>
            <td>{request.quantity} {request.unit}</td>
            <td>
              <span className={`status-chip ${requestStatusTone(displayStatus)}`}>{displayStatus}</span>
              {displayStatus === "Declined" ? (
                <span className="reason-inline">{request.declineReason || "No reason provided."}</span>
              ) : null}
            </td>
            <td>{formatRequestTime(request.requestedAt)}</td>
            <td>
              {displayStatus === "Pending" ? (
                <div className="action-group">
                  <button
                    type="button"
                    className="action-btn action-btn-icon action-btn-accept"
                    onClick={() => handleUpdateRequestStatus(request, "Accepted")}
                    title="Accept request"
                  >
                    &#10003;
                  </button>
                  <button
                    type="button"
                    className="action-btn action-btn-icon action-btn-decline"
                    onClick={() => openDeclineModal(request.id)}
                    title="Decline request"
                  >
                    &#10005;
                  </button>
                </div>
              ) : (
                <span className="muted request-action-note">
                  {displayStatus === "Accepted"
                    ? `Accepted by ${request.targetHospital}`
                    : "Declined"}
                </span>
              )}
            </td>
          </tr>
        )})}
      </>
    );
  }
  const submittedRequests = useMemo(
    () => exchangeRequests.filter((request) => request.fromHospital === activeHospital),
    [exchangeRequests, activeHospital]
  );

  const acceptedForHospital = useMemo(
    () => exchangeRequests.filter((request) => request.status === "Accepted" && request.targetHospital === activeHospital),
    [exchangeRequests, activeHospital]
  );
  const submittedRequestCounts = useMemo(() => ({
    pending: submittedRequests.filter((request) => request.status === "Pending").length,
    accepted: submittedRequests.filter((request) => request.status === "Accepted").length,
    declined: submittedRequests.filter((request) => request.status === "Declined").length
  }), [submittedRequests]);
  const acceptedSubmittedRequests = useMemo(
    () => submittedRequests.filter((request) => request.status === "Accepted"),
    [submittedRequests]
  );
  const declinedSubmittedRequests = useMemo(
    () => submittedRequests.filter((request) => request.status === "Declined"),
    [submittedRequests]
  );
  const filteredSubmittedRequests = useMemo(() => {
    const statusMap = {
      pending: "Pending",
      accepted: "Accepted",
      declined: "Declined"
    };

    return submittedRequests.filter((request) => request.status === statusMap[submittedStatusFilter]);
  }, [submittedRequests, submittedStatusFilter]);
  const declineTarget = useMemo(
    () => exchangeRequests.find((request) => request.id === declineTargetId) || null,
    [declineTargetId, exchangeRequests]
  );

  const stats = useMemo(() => [
    { label: "Total Medicines", value: medicines.length, helper: "Across all categories", color: "#24b9ab" },
    { label: "Hospitals", value: new Set(medicines.filter((m) => m.hospital !== "Unassigned").map((m) => m.hospital)).size, helper: "Connected facilities", color: "#5d8eff" },
    { label: "Low Stock", value: medicines.filter((m) => stockState(m) === "Low Stock").length, helper: "Needs reorder soon", color: "#d6a12d" },
    { label: "Expiring Soon", value: medicines.filter((m) => { const days = daysUntil(m.expiry); return days >= 0 && days <= 30; }).length, helper: "Within 30 days", color: "#c98a1d" },
    { label: "Expired", value: medicines.filter((m) => daysUntil(m.expiry) < 0).length, helper: "Immediate action needed", color: "#d9534f" },
    { label: "Excess Available", value: medicines.filter((m) => m.excess).length, helper: "Ready for sharing", color: "#a855f7" }
  ], [medicines]);

  const alertStats = useMemo(() => [
    { label: "Expired Medicines", value: medicines.filter((item) => daysUntil(item.expiry) < 0).length, color: "#b9403b" },
    { label: "Critical (<7 days)", value: medicines.filter((item) => { const days = daysUntil(item.expiry); return days >= 0 && days < 7; }).length, color: "#b66b19" },
    { label: "Expiring Soon (<=30 days)", value: medicines.filter((item) => { const days = daysUntil(item.expiry); return days >= 7 && days <= 30; }).length, color: "#c98a1d" }
  ], [medicines]);

  const newMedicineDefaults = useMemo(
    () => buildDefaultForm(activeHospital),
    [activeHospital]
  );
  const exchangeMedicineDefaults = useMemo(
    () => ({ ...buildDefaultForm(activeHospital), excess: true }),
    [activeHospital]
  );

  const editingMedicine = useMemo(() => {
    if (editingTarget) {
      return (
        medicines.find(
          (item) => item.barcode === editingTarget.barcode && item.hospital === editingTarget.hospital
        ) || newMedicineDefaults
      );
    }
    return exchangeAddMode ? exchangeMedicineDefaults : newMedicineDefaults;
  }, [editingTarget, exchangeAddMode, exchangeMedicineDefaults, medicines, newMedicineDefaults]);

  function recordExpiredRemoval(count) {
    if (!count) return;
    const todayKey = dateKey();
    setRemovedTodayKey((currentKey) => {
      if (currentKey !== todayKey) {
        setRemovedTodayCount(count);
        return todayKey;
      }
      setRemovedTodayCount((prev) => prev + count);
      return currentKey;
    });
  }

  function applyMedicineCleanup(items, { persist = false, countRemoved = true } = {}) {
    const cleaned = sanitizeMedicines(items);
    const removed = items.length - cleaned.length;
    if (removed > 0 && countRemoved) {
      recordExpiredRemoval(removed);
      if (persist) {
        saveMedicines(cleaned).catch(() => null);
      }
    }
    return cleaned;
  }

  function pushToast(message, tone = "info") {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  }

  async function handleLogin(email, password) {
    const result = await login(email, password);
    if (!result.ok) {
      setAuthError(result.message);
      return;
    }
    setAuthError("");
    setSession(result.session);
  }

  async function handleSignup(payload) {
    const result = await signup(payload);
    if (!result.ok) {
      setAuthError(result.message);
      return;
    }
    setAuthError(result.message || "Account created. Please sign in.");
    setSession(null);
    setAuthMode("login");
  }

  async function handleResetPassword(payload) {
    const result = await resetPassword(payload);
    if (!result.ok) {
      setAuthError(result.message);
      return;
    }
    setAuthError(result.message || "Password updated. Please sign in.");
    setAuthMode("login");
  }

  async function handleLogout() {
    await logout();
    setSession(null);
    setActiveView("dashboard");
    setAuthMode("login");
    setInventorySort({ key: null, dir: "asc" });
    setAlertsSort({ key: null, dir: "asc" });
    setExchangeSort({ key: null, dir: "asc" });
  }

  function openNewModal() {
    setEditingTarget(null);
    setExchangeAddMode(false);
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditingTarget({ barcode: item.barcode, hospital: item.hospital });
    setExchangeAddMode(false);
    setModalOpen(true);
  }

  function openExchangeNewModal() {
    setEditingTarget(null);
    setExchangeAddMode(true);
    setModalOpen(true);
  }

  async function submitMedicine(item) {
    const targetView = exchangeAddMode ? "exchange" : "inventory";
    const normalizedItem = normalizeMedicineStatus({
      ...item,
      addedAt: item.addedAt || new Date().toISOString()
    });
    const updatedItem = editingTarget
      ? await updateMedicineRemote(editingTarget.barcode, normalizedItem, editingTarget.hospital)
      : await createMedicine(normalizedItem);
    setMedicines((current) => {
      if (editingTarget) {
        return sanitizeMedicines(current.map((medicine) =>
          medicine.barcode === editingTarget.barcode && medicine.hospital === editingTarget.hospital
            ? normalizeMedicineStatus(updatedItem)
            : medicine
        ));
      }
      return sanitizeMedicines([normalizeMedicineStatus(updatedItem), ...current]);
    });
    setModalOpen(false);
    setEditingTarget(null);
    setExchangeAddMode(false);
    if (!editingTarget) {
      pushToast("Medicine added successfully.", "success");
    } else {
      pushToast("Medicine updated successfully.", "info");
    }
    setActiveView(targetView);
  }

  async function deleteMedicine(barcode, hospital) {
    await deleteMedicineRemote(barcode, hospital);
    setMedicines((current) => current.filter((item) => item.barcode !== barcode || item.hospital !== hospital));
  }

  function handleScan() {
    runScan(scanValue);
  }

  function handleScanInputChange(event) {
    const nextValue = event.target.value;
    setScanValue(nextValue);
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
    }
    if (nextValue.trim().length < 6) {
      return;
    }
    scanTimerRef.current = setTimeout(() => {
      runScan(nextValue);
    }, 140);
  }

  function handleScanPaste(event) {
    const pasted = event.clipboardData?.getData("text") ?? "";
    if (!pasted) return;
    const nextValue = `${scanValue}${pasted}`;
    setScanValue(nextValue);
    runScan(nextValue);
    event.preventDefault();
  }

  function runScan(value) {
    const trimmed = value.trim();
    const now = Date.now();
    if (trimmed && trimmed === lastScanRef.current.value && now - lastScanRef.current.at < 1500) {
      return;
    }
    const found =
      medicines.find((item) => item.barcode === trimmed && item.hospital === activeHospital) ||
      medicines.find((item) => item.barcode === trimmed);
    if (!trimmed) {
      setScanMessage({ type: "warning", title: "Enter a barcode", detail: "Type or scan a barcode to search the inventory." });
      return;
    }
    if (!found) {
      setScanMessage({ type: "expired", title: "No medicine found", detail: `Barcode ${trimmed} is not in the current demo inventory.` });
      lastScanRef.current = { value: trimmed, at: now };
      return;
    }
    const status = expiryState(found);
    setScanMessage({
      type: status.type === "safe" ? "warning" : status.type,
      title: found.name,
      detail: `${found.quantity} ${found.unit} | ${found.hospital} | Batch ${found.batch}`,
      badge: status.label
    });
    lastScanRef.current = { value: trimmed, at: now };
  }

  useEffect(() => {
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [activeView]);

  function openRequestModal(item) {
    setRequestTarget(item);
    setRequestQuantity(Math.max(1, Math.min(item.quantity, Number.isFinite(item.reorderLevel) ? item.reorderLevel : item.quantity)));
  }

  function closeRequestModal() {
    setRequestTarget(null);
    setRequestQuantity(1);
  }

  async function handleRequestTransfer(item, quantityOverride) {
    const alreadyRequested = exchangeRequests.some(
      (request) =>
        request.barcode === item.barcode &&
        request.status === "Pending" &&
        request.fromHospital === activeHospital &&
        request.targetHospital === "Any"
    );
    if (alreadyRequested) {
      return;
    }

    const safeQuantity = Math.max(1, Math.min(item.quantity, Number(quantityOverride || item.quantity)));

    const nextRequest = {
      id: `${item.barcode}-${Date.now()}`,
      barcode: item.barcode,
      name: item.name,
      quantity: safeQuantity,
      unit: item.unit,
      fromHospital: activeHospital,
      targetHospital: "Any",
      status: "Pending",
      direction: "submitted",
      requestedAt: new Date().toISOString(),
      declineReason: "",
      declinedBy: []
    };

    const created = await createExchangeRequest(nextRequest);
    setExchangeRequests((current) => [created, ...current]);
    pushToast("Request sent successfully.", "info");
  }

  async function handleUpdateRequestStatus(request, status, reason = "") {
    if (!request) return;
    setExchangeActionError("");
    const result = await decideExchangeRequest(request.id, {
      status,
      declineReason: status === "Declined" ? reason : "",
      hospital: activeHospital
    });
    if (!result?.ok) {
      setExchangeActionError(result?.message || "Unable to process this request.");
      return;
    }
    setExchangeActionError("");
    if (Array.isArray(result.medicines)) {
      setMedicines(normalizeMedicines(result.medicines));
    }
    if (Array.isArray(result.requests)) {
      setExchangeRequests(result.requests);
    }
    if (status === "Accepted") {
      pushToast("Request accepted.", "success");
    }
  }

  function openDeclineModal(id) {
    setDeclineTargetId(id);
    setDeclineReason("");
  }

  function closeDeclineModal() {
    setDeclineTargetId(null);
    setDeclineReason("");
  }

  function submitDeclineReason(event) {
    event.preventDefault();
    const reason = declineReason.trim();
    if (!declineTargetId || !reason) {
      return;
    }

    handleUpdateRequestStatus(declineTarget, "Declined", reason);
    closeDeclineModal();
  }

  if (!session) {
    return (
      <LoginScreen
        mode={authMode}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onResetPassword={handleResetPassword}
        errorMessage={authError}
        onToggleMode={() => setAuthMode((current) => current === "login" ? "signup" : "login")}
        onForgot={() => setAuthMode("reset")}
      />
    );
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <img src={logo} alt="Aushiva Logo" />
            </div>
            <div>
              <h1>AUSHIVA</h1>
              <p>MEDICINE INVENTORY</p>
            </div>
          </div>
          <nav className="nav">
            {navItems.map((item) => (
              <button key={item.id} type="button" className={`nav-item ${activeView === item.id ? "active" : ""}`} onClick={() => setActiveView(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ marginTop: "auto", paddingTop: "20px" }}>
            <button type="button" className="nav-item" onClick={handleLogout} style={{ width: "100%" }}>
              <span className="nav-icon">LO</span>
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">Smart stock visibility</p>
              <h2>{navItems.find((item) => item.id === activeView)?.label}</h2>
              <p className="session-copy">{session.name} | {session.role} | {session.hospital || activeHospital}</p>
            </div>
            <div className="topbar-actions">
              <input className="global-search" type="text" placeholder="Search medicines, barcode, hospitals..." />
              {activeView === "alerts" && removedTodayCount > 0 ? (
                <div className="expiry-removal-wrap">
                  <button
                    type="button"
                    className="expiry-removal-icon"
                    onClick={() => setShowRemovalDetail((current) => !current)}
                    title="View removed expired medicines"
                    aria-label="View removed expired medicines"
                  >
                    &#9888;
                  </button>
                  {showRemovalDetail ? (
                    <div className="expiry-removal-badge">{removedTodayCount} expired medicines removed today.</div>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="primary-btn" onClick={openNewModal}>+ Add Medicine</button>
              <button type="button" className="ghost-btn" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          {activeView === "dashboard" && (
            <section className="view active">
              <div className="stat-grid">
                {stats.map((stat) => (
                  <article className="stat-card" style={{ color: stat.color }} key={stat.label}>
                    <div className="label">{stat.label}</div>
                    <div className="value">{stat.value}</div>
                    <div className="helper">{stat.helper}</div>
                  </article>
                ))}
              </div>
              <div className="panel-grid two-up">
                <article className="panel">
                  <div className="panel-head">
                    <h3>Inventory by Category</h3>
                    <span className="muted">Live category share</span>
                  </div>
                  <div className="donut-layout">
                    <div className="donut-chart" style={donutStyle} />
                    <div className="legend">
                      {Object.entries(counts).map(([name, count]) => (
                        <div className="legend-item" key={name}>
                          <span className="legend-swatch" style={{ background: categoryColors[name] || "#94a3b8" }} />
                          <span>{name}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-head">
                    <h3>Demand Prediction (Top Medicines)</h3>
                    <span className="muted">Based on frequent usage and seasonal patterns</span>
                  </div>
                  <BarChart data={demandForecast} />
                </article>
              </div>
            </section>
          )}

          {activeView === "inventory" && (
            <section className="view active">
              <article className="panel">
                <div className="inventory-toolbar">
                  <div className="toolbar-left">
                    <input className="toolbar-input" value={inventorySearchInput} onChange={(event) => setInventorySearchInput(event.target.value)} placeholder="Search by name, barcode, manufacturer..." />
                    <select className="toolbar-select" value={inventoryCategory} onChange={(event) => setInventoryCategory(event.target.value)}>
                      {categories.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <button type="button" className="primary-btn" onClick={openNewModal}>+ Add Medicine</button>
                </div>
                <p className="results-copy">Showing {inventoryRows.length} of {medicines.length} medicines</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <SortLabel
                            label="Medicine"
                            sortKey="name"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "name", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "name", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Barcode"
                            sortKey="barcode"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "barcode", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "barcode", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Batch"
                            sortKey="batch"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "batch", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "batch", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Manufacturer"
                            sortKey="manufacturer"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "manufacturer", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "manufacturer", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Qty"
                            sortKey="quantity"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "quantity", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "quantity", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Stock Status"
                            sortKey="stock"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "stock", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "stock", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Manufactured"
                            sortKey="manufacturingDate"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "manufacturingDate", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "manufacturingDate", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Expiry"
                            sortKey="expiry"
                            activeKey={inventorySort.key}
                            activeDir={inventorySort.dir}
                            onAsc={{ dir: "asc", fn: () => setInventorySort({ key: "expiry", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setInventorySort({ key: "expiry", dir: "desc" }) }}
                          />
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryPageRows.map((item) => {
                        const expiry = expiryState(item);
                        return (
                          <tr key={item.barcode}>
                            <td>{item.name}</td>
                            <td>{item.barcode}</td>
                            <td>{item.batch}</td>
                            <td>{item.manufacturer}</td>
                            <td>{item.quantity} {item.unit}</td>
                            <td><span className={`status-chip ${stockState(item) === "Low Stock" ? "low" : "safe"}`}>{stockState(item)}</span></td>
                            <td>{formatDate(resolveManufacturingDate(item))}</td>
                            <td><div>{formatDate(item.expiry)}</div><span className={`status-chip ${expiry.type}`}>{expiry.detail}</span></td>
                            <td><div className="action-group"><button type="button" className="action-btn" onClick={() => openEditModal(item)}>Edit</button><button type="button" className="action-btn" onClick={() => deleteMedicine(item.barcode, item.hospital)}>Delete</button></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-pagination">
                  <span className="muted">
                    Page {inventoryPageClamped} of {inventoryTotalPages}
                  </span>
                  <div className="pagination-actions">
                    <button type="button" className="ghost-btn" onClick={() => setInventoryPage(1)} disabled={inventoryPageClamped === 1}>First</button>
                    <button type="button" className="ghost-btn" onClick={() => setInventoryPage((current) => Math.max(1, current - 1))} disabled={inventoryPageClamped === 1}>Prev</button>
                    <button type="button" className="ghost-btn" onClick={() => setInventoryPage((current) => Math.min(inventoryTotalPages, current + 1))} disabled={inventoryPageClamped === inventoryTotalPages}>Next</button>
                    <button type="button" className="ghost-btn" onClick={() => setInventoryPage(inventoryTotalPages)} disabled={inventoryPageClamped === inventoryTotalPages}>Last</button>
                  </div>
                  <select
                    className="toolbar-select"
                    value={inventoryPageSize}
                    onChange={(event) => {
                      setInventoryPageSize(Number(event.target.value));
                      setInventoryPage(1);
                    }}
                  >
                    {[25, 50, 100, 200].map((size) => (
                      <option key={size} value={size}>{size} / page</option>
                    ))}
                  </select>
                </div>
              </article>
            </section>
          )}

          {activeView === "scan" && (
            <section className="view active">
              <article className="scan-panel">
                <div className="panel-head">
                  <h3>Barcode Scanner</h3>
                  <span className="muted">Multi-mode scan</span>
                </div>
                <p className="scan-copy">Scan directly into the field below.</p>
                <div className="scan-row">
                  <input
                    ref={scanInputRef}
                    className="scan-input"
                    value={scanValue}
                    onChange={handleScanInputChange}
                    onPaste={handleScanPaste}
                    onKeyDown={(event) => event.key === "Enter" && handleScan()}
                    placeholder="Scan or type barcode here..."
                  />
                  <button type="button" className="primary-btn" onClick={handleScan}>Search</button>
                </div>
                <p className="scan-tip">Tip: click the field and scan. Most scanners paste the value as keyboard input.</p>
                {scanMessage ? (
                  <div className={`alert-card ${scanMessage.type}`}>
                    <div className="alert-copy">
                      <strong>{scanMessage.title}</strong>
                      <span>{scanMessage.detail}</span>
                    </div>
                    {scanMessage.badge ? <span className="pill">{scanMessage.badge}</span> : null}
                  </div>
                ) : null}
              </article>
            </section>
          )}

          {activeView === "alerts" && (
            <section className="view active">
              <div className="stat-grid compact">
                {alertStats.map((stat) => (
                  <article className="stat-card" style={{ color: stat.color }} key={stat.label}>
                    <div className="value">{stat.value}</div>
                    <div className="label">{stat.label}</div>
                  </article>
                ))}
              </div>
              <article className="panel">
                <div className="inventory-toolbar">
                  <div className="toolbar-left">
                    <input className="toolbar-input" value={alertsSearch} onChange={(event) => setAlertsSearch(event.target.value)} placeholder="Search medicines..." />
                    <select className="toolbar-select" value={alertsFilter} onChange={(event) => setAlertsFilter(event.target.value)}>
                      <option value="all">All Alerts</option>
                      <option value="expired">Expired</option>
                      <option value="critical">Critical (&lt; 7 days)</option>
                      <option value="warning">Warning (&lt; 30 days)</option>
                    </select>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <SortLabel
                            label="Medicine"
                            sortKey="name"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "name", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "name", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Barcode"
                            sortKey="barcode"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "barcode", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "barcode", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Batch"
                            sortKey="batch"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "batch", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "batch", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Qty"
                            sortKey="quantity"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "quantity", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "quantity", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Manufactured"
                            sortKey="manufacturingDate"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "manufacturingDate", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "manufacturingDate", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Expiry Date"
                            sortKey="expiry"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "expiry", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "expiry", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Status"
                            sortKey="status"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "status", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "status", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Hospital"
                            sortKey="hospital"
                            activeKey={alertsSort.key}
                            activeDir={alertsSort.dir}
                            onAsc={{ dir: "asc", fn: () => setAlertsSort({ key: "hospital", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setAlertsSort({ key: "hospital", dir: "desc" }) }}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertRows.map((item) => {
                        const status = expiryState(item);
                        return (
                          <tr key={item.barcode}>
                            <td>{item.name}</td>
                            <td>{item.barcode}</td>
                            <td>{item.batch}</td>
                            <td>{item.quantity} {item.unit}</td>
                            <td>{formatDate(resolveManufacturingDate(item))}</td>
                            <td>{formatDate(item.expiry)}</td>
                            <td><span className={`status-chip ${status.type}`}>{status.label}</span></td>
                            <td>{item.hospital}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          )}

          {activeView === "usage" && (
            <section className="view active">
              <div className="panel-grid two-up">
                <article className="panel">
                  <div className="panel-head">
                    <h3>Fast-Moving Medicines</h3>
                    <span className="muted">Last 30 days</span>
                  </div>
                  <BarChart data={usageData} />
                </article>
                <article className="panel">
                  <div className="panel-head">
                    <h3>Usage Summary</h3>
                    <span className="muted">Department level trend</span>
                  </div>
                  <div className="summary-list">
                    {departments.map((item) => (
                      <div className="summary-card" key={item.name}>
                        <strong>{item.name}</strong>
                        <span>{item.copy}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>
          )}

          {activeView === "exchange" && (
            <section className="view active">
              <div className="stat-grid compact">
                <article className="stat-card" style={{ color: "#24b9ab" }}>
                  <div className="value">{exchangeListings.length}</div>
                  <div className="label">Exchange Listings</div>
                </article>
                <article className="stat-card" style={{ color: "#1d8f80" }}>
                  <div className="value">{submittedRequests.length}</div>
                  <div className="label">Submitted Requests</div>
                </article>
                <article className="stat-card" style={{ color: "#5d8eff" }}>
                  <div className="value">{approvalPool.length}</div>
                  <div className="label">Request Approvals</div>
                </article>
              </div>
              <article className="panel">
                <div className="panel-head">
                  <h3>Request Approvals</h3>
                  <span className="muted">Review and approve requests sent to your hospital by other hospitals</span>
                </div>
                {exchangeActionError ? <p className="results-copy">{exchangeActionError}</p> : null}
                {approvalPool.length === 0 ? (
                  <p className="results-copy">No approval requests are waiting right now.</p>
                ) : (
                  <div className="request-status-section">
                    <div className="request-status-summary">
                      <button
                        type="button"
                        className={`request-status-card pending ${approvalStatusFilter === "pending" ? "active" : ""}`}
                        onClick={() => setApprovalStatusFilter("pending")}
                      >
                        <strong>{incomingRequestCounts.pending}</strong>
                        <span>Requested</span>
                      </button>
                      <button
                        type="button"
                        className={`request-status-card accepted ${approvalStatusFilter === "accepted" ? "active" : ""}`}
                        onClick={() => setApprovalStatusFilter("accepted")}
                      >
                        <strong>{incomingRequestCounts.accepted}</strong>
                        <span>Accepted</span>
                      </button>
                      <button
                        type="button"
                        className={`request-status-card declined ${approvalStatusFilter === "declined" ? "active" : ""}`}
                        onClick={() => setApprovalStatusFilter("declined")}
                      >
                        <strong>{incomingRequestCounts.declined}</strong>
                        <span>Declined</span>
                      </button>
                    </div>
                    {filteredIncomingRequests.length === 0 ? (
                      <p className="results-copy">No {approvalStatusFilter === "all" ? "" : approvalStatusFilter} approval requests to show right now.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="request-approvals-table">
                          <thead>
                            <tr>
                              <th>Medicine</th><th>Barcode</th><th>From Hospital</th><th>To Hospital</th><th>Quantity</th><th>Status</th><th>Requested At</th><th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {renderApprovalSection("Requested", approvalsGrouped.pending)}
                            {renderApprovalSection("Accepted", approvalsGrouped.accepted)}
                            {renderApprovalSection("Declined", approvalsGrouped.declined)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="panel-head">
                  <h3>My Request Status</h3>
                  <span className="muted">Track your requested medicines and which hospital accepted them</span>
                </div>
                {submittedRequests.length === 0 ? (
                  <p className="results-copy">No submitted requests yet. Use the Request Transfer button above to create one.</p>
                ) : (
                  <div className="request-status-section">
                    <div className="request-status-summary">
                      <button
                        type="button"
                        className={`request-status-card pending ${submittedStatusFilter === "pending" ? "active" : ""}`}
                        onClick={() => setSubmittedStatusFilter("pending")}
                      >
                        <strong>{submittedRequestCounts.pending}</strong>
                        <span>Requested</span>
                      </button>
                      <button
                        type="button"
                        className={`request-status-card accepted ${submittedStatusFilter === "accepted" ? "active" : ""}`}
                        onClick={() => setSubmittedStatusFilter("accepted")}
                      >
                        <strong>{submittedRequestCounts.accepted}</strong>
                        <span>Accepted</span>
                      </button>
                      <button
                        type="button"
                        className={`request-status-card declined ${submittedStatusFilter === "declined" ? "active" : ""}`}
                        onClick={() => setSubmittedStatusFilter("declined")}
                      >
                        <strong>{submittedRequestCounts.declined}</strong>
                        <span>Declined</span>
                      </button>
                    </div>
                    {filteredSubmittedRequests.length === 0 ? (
                      <p className="results-copy">No {submittedStatusFilter} requests to show right now.</p>
                    ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Medicine</th><th>Barcode</th><th>Requested From</th><th>Your Hospital</th><th>Quantity</th><th>Status</th><th>Requested At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSubmittedRequests.map((request) => (
                            <tr key={request.id}>
                              <td>{request.name}</td>
                              <td>{request.barcode}</td>
                              <td>{request.targetHospital === "Any" ? "Any Hospital" : request.targetHospital}</td>
                              <td>{request.fromHospital}</td>
                              <td>{request.quantity} {request.unit}</td>
                              <td>
                                <span className={`status-chip ${requestStatusTone(request.status)}`}>{request.status}</span>
                                {request.status === "Declined" ? (
                                  <span className="reason-inline">{request.declineReason || "No reason provided."}</span>
                                ) : null}
                              </td>
                              <td>{formatRequestTime(request.requestedAt)}</td>
                            </tr>
                          ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="panel-head">
                  <h3>Hospital Exchange Board</h3>
                  <span className="muted">Share excess stock before expiry</span>
                </div>
                <div className="inventory-toolbar">
                  <div className="toolbar-left">
                    <input
                      className="toolbar-input"
                      value={exchangeSearch}
                      onChange={(event) => setExchangeSearch(event.target.value)}
                      placeholder="Search medicine, barcode, batch, hospital..."
                    />
                  </div>
                  <button type="button" className="primary-btn" onClick={openExchangeNewModal}>+ Add Exchange Medicine</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <SortLabel
                            label="Medicine"
                            sortKey="name"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "name", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "name", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Category"
                            sortKey="category"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "category", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "category", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Available Qty"
                            sortKey="quantity"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "quantity", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "quantity", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Manufactured"
                            sortKey="manufacturingDate"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "manufacturingDate", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "manufacturingDate", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Expiry"
                            sortKey="expiry"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "expiry", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "expiry", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Offering Hospital"
                            sortKey="hospital"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "hospital", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "hospital", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Status"
                            sortKey="priority"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "priority", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "priority", dir: "desc" }) }}
                          />
                        </th>
                        <th>
                          <SortLabel
                            label="Action"
                            sortKey="action"
                            activeKey={exchangeSort.key}
                            activeDir={exchangeSort.dir}
                            onAsc={{ dir: "asc", fn: () => setExchangeSort({ key: "action", dir: "asc" }) }}
                            onDesc={{ dir: "desc", fn: () => setExchangeSort({ key: "action", dir: "desc" }) }}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {exchangeListings.map((item) => {
                        const expiry = expiryState(item);
                        const priority = expiryPriority(item);
                        const isOwnListing = item.hospital === activeHospital;
                        const existingRequest = exchangeRequests.find((request) =>
                          request.direction === "submitted" &&
                          request.barcode === item.barcode &&
                          request.fromHospital === activeHospital &&
                          request.status === "Pending"
                        );
                        return (
                          <tr key={item.barcode}>
                            <td>{item.name}</td>
                            <td>{item.category}</td>
                            <td>{item.quantity} {item.unit}</td>
                            <td>{formatDate(resolveManufacturingDate(item))}</td>
                            <td>{formatDate(item.expiry)}</td>
                            <td>{item.hospital}</td>
                            <td><span className={`status-chip ${priority.type}`}>{priority.label}</span></td>
                            <td>
                              <button
                                type="button"
                                className="primary-btn exchange-request-btn"
                                onClick={() => openRequestModal(item)}
                                disabled={Boolean(existingRequest) || isOwnListing}
                              >
                                {isOwnListing ? "Your Listing" : existingRequest ? "Requested" : "Request Transfer"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>

            </section>
          )}
        </main>
      </div>

      <MedicineModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTarget(null);
          setExchangeAddMode(false);
        }}
        onSubmit={submitMedicine}
        initialValues={editingMedicine}
      />

      {declineTarget ? (
        <div className="modal-backdrop">
          <div className="modal-card decline-modal">
            <div className="modal-head">
              <h3>Decline Request</h3>
              <button className="icon-btn" onClick={closeDeclineModal} type="button">x</button>
            </div>
            <p className="muted decline-copy">
              Add a reason for declining the request from {declineTarget.fromHospital} for {declineTarget.name}.
            </p>
            <form onSubmit={submitDeclineReason} className="decline-form">
              <label>
                <span>Decline Reason</span>
                <textarea
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="Explain why this request is being declined..."
                  rows={4}
                  required
                />
              </label>
              <div className="form-actions">
                <button type="button" className="ghost-btn" onClick={closeDeclineModal}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={!declineReason.trim()}>Confirm Decline</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {requestTarget ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Request Transfer</h3>
              <button className="icon-btn" onClick={closeRequestModal} type="button">x</button>
            </div>
            <p className="muted decline-copy">
              Request quantity for {requestTarget.name} from available stock.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleRequestTransfer(requestTarget, requestQuantity);
                closeRequestModal();
              }}
              className="decline-form"
            >
              <label>
                <span>Quantity (max {requestTarget.quantity})</span>
                <input
                  type="number"
                  min="1"
                  max={requestTarget.quantity}
                  value={requestQuantity}
                  onChange={(event) => setRequestQuantity(Number(event.target.value))}
                  required
                />
              </label>
              <div className="form-actions">
                <button type="button" className="ghost-btn" onClick={closeRequestModal}>Cancel</button>
                <button type="submit" className="primary-btn">Send Request</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toasts.length ? (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.tone}`}>{toast.message}</div>
          ))}
        </div>
      ) : null}
    </>
  );
}
