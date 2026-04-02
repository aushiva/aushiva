import {
  bootstrapLocalBackend,
  getExchangeRequests as getExchangeRequestsLocal,
  getMedicines as getMedicinesLocal,
  getSession as getSessionLocal,
  login as loginLocal,
  logout as logoutLocal,
  saveExchangeRequests as saveExchangeRequestsLocal,
  saveMedicines as saveMedicinesLocal
} from "./localBackend";

const useRemote = import.meta.env.VITE_USE_REMOTE_BACKEND !== "false";
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include",
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function bootstrapBackend() {
  if (!useRemote) {
    bootstrapLocalBackend();
    return;
  }

  await request("/bootstrap", { method: "POST" });
}

export async function getMedicines() {
  if (!useRemote) {
    return getMedicinesLocal();
  }
  return request("/medicines");
}

export async function saveMedicines(medicines) {
  if (!useRemote) {
    return saveMedicinesLocal(medicines);
  }
  return request("/medicines", {
    method: "PUT",
    body: JSON.stringify({ medicines })
  });
}

export async function login(email, password) {
  if (!useRemote) {
    return loginLocal(email, password);
  }
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function signup(payload) {
  if (!useRemote) {
    return { ok: false, message: "Signup requires the backend." };
  }
  return request("/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function resetPassword(payload) {
  if (!useRemote) {
    return { ok: false, message: "Password reset requires the backend." };
  }
  return request("/reset-password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function logout() {
  if (!useRemote) {
    return logoutLocal();
  }
  return request("/logout", { method: "POST" });
}

export async function getSession() {
  if (!useRemote) {
    return getSessionLocal();
  }
  return request("/session");
}

export async function getExchangeRequests() {
  if (!useRemote) {
    return getExchangeRequestsLocal();
  }
  return request("/exchange-requests");
}

export async function saveExchangeRequests(requests) {
  if (!useRemote) {
    return saveExchangeRequestsLocal(requests);
  }
  return request("/exchange-requests", {
    method: "PUT",
    body: JSON.stringify({ requests })
  });
}

export async function createMedicine(medicine) {
  if (!useRemote) {
    const current = getMedicinesLocal();
    const next = [medicine, ...current];
    saveMedicinesLocal(next);
    return medicine;
  }
  return request("/medicines", {
    method: "POST",
    body: JSON.stringify(medicine)
  });
}

export async function updateMedicine(barcode, medicine, originalHospital) {
  if (!useRemote) {
    const current = getMedicinesLocal();
    const lookupHospital = originalHospital || medicine.hospital;
    const next = current.map((item) =>
      item.barcode === barcode && item.hospital === lookupHospital ? { ...medicine } : item
    );
    saveMedicinesLocal(next);
    return medicine;
  }
  const payload = originalHospital ? { ...medicine, originalHospital } : medicine;
  return request(`/medicines/${encodeURIComponent(barcode)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteMedicine(barcode, hospital) {
  if (!useRemote) {
    const current = getMedicinesLocal();
    const next = current.filter((item) => item.barcode !== barcode || item.hospital !== hospital);
    saveMedicinesLocal(next);
    return;
  }
  await request(`/medicines/${encodeURIComponent(barcode)}?hospital=${encodeURIComponent(hospital)}`, { method: "DELETE" });
}

export async function createExchangeRequest(requests) {
  if (!useRemote) {
    const current = getExchangeRequestsLocal();
    const next = [requests, ...current];
    saveExchangeRequestsLocal(next);
    return requests;
  }
  return request("/exchange-requests", {
    method: "POST",
    body: JSON.stringify(requests)
  });
}

export async function updateExchangeRequest(id, updates) {
  if (!useRemote) {
    const current = getExchangeRequestsLocal();
    const next = current.map((item) => item.id === id ? { ...item, ...updates } : item);
    saveExchangeRequestsLocal(next);
    return next.find((item) => item.id === id) || null;
  }
  return request(`/exchange-requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
}

export async function decideExchangeRequest(id, payload) {
  if (!useRemote) {
    return { ok: false, message: "Decision requires the backend." };
  }
  return request(`/exchange-requests/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
