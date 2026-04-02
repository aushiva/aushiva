import { generatedMedicines } from "./generatedMedicines.js";

const hospitalPool = [
  "National Medical Center",
  "Apollo District Hospital",
  "City General Hospital",
  "Wellness Community Hospital"
];

export const currentHospital = hospitalPool[0];

const alertMedicines = [
  {
    name: "Amoxicillin 500",
    barcode: "890123450501",
    batch: "AMX-2024-11-021",
    manufacturer: "Cipla",
    category: "Antibiotic",
    quantity: 18,
    unit: "capsules",
    expiry: "2026-02-28",
    manufacturingDate: "2024-02-28",
    hospital: "Apollo District Hospital",
    price: 12.5,
    status: "Active",
    excess: false,
    reorderLevel: 20
  },
  {
    name: "Metformin 500",
    barcode: "890123450502",
    batch: "MET-2024-10-014",
    manufacturer: "Torrent",
    category: "Hormonal",
    quantity: 28,
    unit: "tablets",
    expiry: "2026-03-05",
    manufacturingDate: "2024-03-05",
    hospital: "City General Hospital",
    price: 3.2,
    status: "Active",
    excess: false,
    reorderLevel: 25
  },
  {
    name: "Azithromycin 250",
    barcode: "890123450503",
    batch: "AZI-2024-09-009",
    manufacturer: "Aurobindo",
    category: "Antibiotic",
    quantity: 14,
    unit: "tablets",
    expiry: "2026-03-01",
    manufacturingDate: "2024-03-01",
    hospital: "Wellness Community Hospital",
    price: 7.5,
    status: "Active",
    excess: false,
    reorderLevel: 18
  },
  {
    name: "Paracetamol 650",
    barcode: "890123450504",
    batch: "PCM-2024-09-028",
    manufacturer: "Sun Pharma",
    category: "Analgesic",
    quantity: 42,
    unit: "tablets",
    expiry: "2026-03-19",
    manufacturingDate: "2024-03-19",
    hospital: "National Medical Center",
    price: 1.8,
    status: "Active",
    excess: false,
    reorderLevel: 30
  },
  {
    name: "Vitamin D3 60K",
    barcode: "890123450505",
    batch: "VD3-2024-08-033",
    manufacturer: "Abbott",
    category: "Vitamin",
    quantity: 36,
    unit: "capsules",
    expiry: "2026-03-16",
    manufacturingDate: "2024-03-16",
    hospital: "Apollo District Hospital",
    price: 8.0,
    status: "Active",
    excess: false,
    reorderLevel: 24
  },
  {
    name: "Omeprazole 20",
    barcode: "890123450506",
    batch: "OMP-2024-08-041",
    manufacturer: "Zydus",
    category: "GI",
    quantity: 22,
    unit: "capsules",
    expiry: "2026-03-21",
    manufacturingDate: "2024-03-21",
    hospital: "City General Hospital",
    price: 4.1,
    status: "Active",
    excess: false,
    reorderLevel: 20
  },
  {
    name: "Cetirizine 10",
    barcode: "890123450507",
    batch: "CTZ-2024-07-052",
    manufacturer: "Dr. Reddy's",
    category: "Respiratory",
    quantity: 65,
    unit: "tablets",
    expiry: "2026-04-07",
    manufacturingDate: "2024-04-07",
    hospital: "Wellness Community Hospital",
    price: 2.25,
    status: "Active",
    excess: false,
    reorderLevel: 25
  },
  {
    name: "Salbutamol Inhaler",
    barcode: "890123450508",
    batch: "SAL-2024-07-019",
    manufacturer: "GSK",
    category: "Respiratory",
    quantity: 19,
    unit: "vials",
    expiry: "2026-04-02",
    manufacturingDate: "2024-04-02",
    hospital: "Apollo District Hospital",
    price: 120,
    status: "Active",
    excess: false,
    reorderLevel: 15
  },
  {
    name: "Atorvastatin 10",
    barcode: "890123450509",
    batch: "ATV-2024-06-063",
    manufacturer: "Lupin",
    category: "Cardiovascular",
    quantity: 44,
    unit: "tablets",
    expiry: "2026-04-12",
    manufacturingDate: "2024-04-12",
    hospital: "City General Hospital",
    price: 6.4,
    status: "Active",
    excess: false,
    reorderLevel: 30
  },
  {
    name: "Ibuprofen 400",
    barcode: "890123450510",
    batch: "IBU-2024-06-074",
    manufacturer: "Mankind Pharma",
    category: "Analgesic",
    quantity: 58,
    unit: "tablets",
    expiry: "2026-04-09",
    manufacturingDate: "2024-04-09",
    hospital: "Wellness Community Hospital",
    price: 2.9,
    status: "Active",
    excess: false,
    reorderLevel: 25
  },
  {
    name: "Aspirin 75",
    barcode: "890123450511",
    batch: "ASP-2024-05-031",
    manufacturer: "Glenmark",
    category: "Other",
    quantity: 24,
    unit: "tablets",
    expiry: "2026-03-08",
    manufacturingDate: "2024-03-08",
    hospital: "National Medical Center",
    price: 2.1,
    status: "Active",
    excess: false,
    reorderLevel: 20
  },
  {
    name: "ORS Sachet",
    barcode: "890123450512",
    batch: "ORS-2024-05-044",
    manufacturer: "Abbott",
    category: "Other",
    quantity: 38,
    unit: "sachets",
    expiry: "2026-03-16",
    manufacturingDate: "2024-03-16",
    hospital: "Apollo District Hospital",
    price: 3.4,
    status: "Active",
    excess: false,
    reorderLevel: 30
  },
  {
    name: "Losartan 50",
    barcode: "890123450513",
    batch: "LOS-2024-05-057",
    manufacturer: "Sun Pharma",
    category: "Cardiovascular",
    quantity: 27,
    unit: "tablets",
    expiry: "2026-04-05",
    manufacturingDate: "2024-04-05",
    hospital: "City General Hospital",
    price: 5.2,
    status: "Active",
    excess: false,
    reorderLevel: 22
  }
];

function deriveManufacturingDate(expiry) {
  const expiryDate = new Date(`${expiry}T00:00:00`);
  const manufacturingDate = new Date(expiryDate);
  manufacturingDate.setFullYear(manufacturingDate.getFullYear() - 2);
  return manufacturingDate.toISOString().slice(0, 10);
}

function resolveReorderLevel(medicine) {
  return Number.isFinite(medicine.reorderLevel) ? medicine.reorderLevel : 20;
}

export const seedMedicines = generatedMedicines.map((medicine, index) => {
  const hospital = hospitalPool[index % hospitalPool.length];
  const reorderLevel = resolveReorderLevel(medicine);
  const quantityBuffer = medicine.quantity > reorderLevel * 2;
  const shouldShare = quantityBuffer && index % 9 === 0;

  return {
    ...medicine,
    manufacturingDate: medicine.manufacturingDate || deriveManufacturingDate(medicine.expiry),
    hospital,
    excess: shouldShare
  };
}).concat(alertMedicines);

export const seedExchangeRequests = seedMedicines
  .filter((medicine) => medicine.excess && medicine.hospital === currentHospital)
  .slice(0, 5)
  .map((medicine, index) => ({
    id: `seed-incoming-${medicine.barcode}`,
    barcode: medicine.barcode,
    name: medicine.name,
    quantity: Math.max(10, Math.min(medicine.quantity, resolveReorderLevel(medicine) + 12 + index * 4)),
    unit: medicine.unit,
    fromHospital: hospitalPool[(index + 1) % hospitalPool.length],
    targetHospital: currentHospital,
    status: index < 2 ? "Accepted" : "Pending",
    direction: "incoming",
    requestedAt: new Date(Date.UTC(2026, 2, 10, 9 + index, 15)).toISOString(),
    declineReason: ""
  }))
  .concat(
    seedMedicines
      .filter((medicine) => medicine.excess && medicine.hospital !== currentHospital)
      .slice(0, 3)
      .map((medicine, index) => ({
        id: `seed-submitted-${medicine.barcode}`,
        barcode: medicine.barcode,
        name: medicine.name,
        quantity: Math.max(12, Math.min(medicine.quantity, resolveReorderLevel(medicine) + 16 + index * 5)),
        unit: medicine.unit,
        fromHospital: currentHospital,
        targetHospital: medicine.hospital,
        status: index === 0 ? "Pending" : index === 1 ? "Accepted" : "Declined",
        direction: "submitted",
        requestedAt: new Date(Date.UTC(2026, 2, 11, 10 + index, 20)).toISOString(),
        declineReason: index === 2 ? "Stock reserved for emergency demand at the offering hospital." : ""
      }))
  );

export const seedUser = {
  name: "Aushiva Admin",
  email: "aushiva2026@gmail.com",
  password: "Admin@123",
  role: "Inventory Manager",
  hospital: currentHospital
};

export const demandForecast = [
  { label: "Paracetamol 650", value: 310 },
  { label: "Cetirizine 10", value: 230 },
  { label: "Salbutamol", value: 205 },
  { label: "Azithromycin 250", value: 180 },
  { label: "Amoxicillin 500", value: 170 },
  { label: "Pantoprazole", value: 150 },
  { label: "Vitamin C", value: 140 }
];

export const usageData = [
  { label: "Paracetamol 650", value: 520 },
  { label: "Cetirizine 10", value: 410 },
  { label: "Salbutamol", value: 360 },
  { label: "Pantoprazole", value: 300 },
  { label: "Azithromycin 250", value: 260 },
  { label: "Amoxicillin 500", value: 230 }
];

export const departments = [
  { name: "Emergency", copy: "224 units issued this week. Analgesics and antipyretics are driving demand." },
  { name: "General Ward", copy: "318 units issued. Antibiotic usage steady with a mild uptick in GI meds." },
  { name: "Outpatient", copy: "276 units issued. Respiratory and allergy medicines up 14% vs last month." },
  { name: "ICU", copy: "112 units issued. Critical respiratory support meds remain high priority." }
];

export const categories = ["All Categories", "Antibiotic", "Analgesic", "Antiviral", "Antiseptic", "Cardiovascular", "Respiratory", "GI", "Dermatological", "Neurological", "Hormonal", "Vitamin", "Other"];

export const hospitals = [...hospitalPool, "Unassigned"];

export const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "DB" },
  { id: "inventory", label: "Inventory", icon: "IN" },
  { id: "scan", label: "Scan Barcode", icon: "SC" },
  { id: "alerts", label: "Expiry Alerts", icon: "EX" },
  { id: "usage", label: "Usage Tracking", icon: "UT" },
  { id: "exchange", label: "Hospital Exchange", icon: "HX" }
];

export const categoryColors = {
  Analgesic: "#24b9ab",
  Vitamin: "#3f7ce8",
  Other: "#f0ab1d",
  Antibiotic: "#ef4444",
  Cardiovascular: "#8b5cf6",
  Hormonal: "#ec4899",
  Respiratory: "#22c55e",
  Neurological: "#6366f1",
  GI: "#e8791b"
};
