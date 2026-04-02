import {
  createMedicine,
  countExchangeRequests,
  countMedicines,
  ensureUser,
  getMedicineByBarcodeAndHospital,
  migrateUserEmail,
  updateUserHospital,
  replaceExchangeRequests,
  replaceMedicines
} from "./db.js";
import { seedExchangeRequests, seedMedicines, seedUser } from "../../src/data/seed.js";

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

export function seedIfEmpty() {
  if (countMedicines() === 0) {
    replaceMedicines(seedMedicines);
  }

  alertMedicines.forEach((medicine) => {
    if (!getMedicineByBarcodeAndHospital(medicine.barcode, medicine.hospital)) {
      createMedicine(medicine);
    }
  });

  if (countExchangeRequests() === 0) {
    replaceExchangeRequests(seedExchangeRequests);
  }

  migrateUserEmail("admin@aushiva.local", seedUser);
  ensureUser(seedUser);
  updateUserHospital(seedUser.email, "Aushiva");
}
