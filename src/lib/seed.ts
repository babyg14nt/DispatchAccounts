/**
 * Demo dataset seeder — populates a realistic 5-month operating history for
 * a mid-size carrier. Runs automatically when the database is empty, or on
 * demand via POST /api/seed (used by the "Reset demo data" action).
 */
import { db } from "@/db";
import {
  brokers,
  deductions,
  drivers,
  expenses,
  loads,
  maintenance,
  settlementItems,
  settlements,
  trucks,
} from "@/db/schema";
import { generateSettlement } from "@/lib/settlements";
import { round2 } from "@/lib/finance";

/* Deterministic PRNG so every fresh install looks identical & curated */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rnd: () => number, arr: readonly T[]) =>
  arr[Math.floor(rnd() * arr.length)];
const between = (rnd: () => number, lo: number, hi: number) =>
  lo + rnd() * (hi - lo);

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.round(days));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const LANES = [
  "Chicago, IL", "Columbus, OH", "Indianapolis, IN", "Dallas, TX", "Atlanta, GA",
  "Kansas City, MO", "Nashville, TN", "Memphis, TN", "Denver, CO", "Phoenix, AZ",
  "Houston, TX", "Charlotte, NC", "St. Louis, MO", "Louisville, KY",
  "Minneapolis, MN", "Oklahoma City, OK", "Omaha, NE", "Detroit, MI",
  "Cleveland, OH", "Fort Worth, TX", "Greensboro, NC", "Birmingham, AL",
];

export async function isDatabaseEmpty(): Promise<boolean> {
  const rows = await db.select({ id: drivers.id }).from(drivers).limit(1);
  return rows.length === 0;
}

export async function resetAndSeed() {
  /* FK-safe wipe order */
  await db.delete(settlementItems);
  await db.delete(settlements);
  await db.delete(deductions);
  await db.delete(loads);
  await db.delete(maintenance);
  await db.delete(expenses);
  await db.delete(trucks);
  await db.delete(brokers);
  await db.delete(drivers);
  await seed();
}

export async function seed() {
  const rnd = mulberry32(20261501);

  /* ------------------------------- Drivers ------------------------------ */
  const driverSeed = [
    { name: "Miguel Santos", phone: "(312) 555-0184", email: "m.santos@ironhaul.co", licenseNumber: "IL-DL-78451203", payType: "percentage", payRate: "27", status: "active" },
    { name: "Deborah Cole", phone: "(614) 555-0127", email: "d.cole@ironhaul.co", licenseNumber: "OH-DL-22918744", payType: "percentage", payRate: "26", status: "active" },
    { name: "Andre Foster", phone: "(404) 555-0166", email: "a.foster@ironhaul.co", licenseNumber: "GA-DL-88123471", payType: "percentage", payRate: "28", status: "active" },
    { name: "Yolanda Reyes", phone: "(214) 555-0139", email: "y.reyes@ironhaul.co", licenseNumber: "TX-DL-55120983", payType: "per_mile", payRate: "0.68", status: "active" },
    { name: "Sam Whitfield", phone: "(816) 555-0112", email: "s.whitfield@ironhaul.co", licenseNumber: "MO-DL-30998821", payType: "per_mile", payRate: "0.66", status: "active" },
    { name: "Chris Pyle", phone: "(615) 555-0178", email: "c.pyle@ironhaul.co", licenseNumber: "TN-DL-66231445", payType: "per_mile", payRate: "0.70", status: "active" },
    { name: "Tonya Ibrahim", phone: "(317) 555-0195", email: "t.ibrahim@ironhaul.co", licenseNumber: "IN-DL-77512034", payType: "flat", payRate: "980", status: "active" },
    { name: "Dale Mercer", phone: "(402) 555-0141", email: "d.mercer@ironhaul.co", licenseNumber: "NE-DL-11882377", payType: "percentage", payRate: "24", status: "inactive" },
  ];
  const insertedDrivers = await db.insert(drivers).values(driverSeed).returning();
  const activeDrivers = insertedDrivers.filter((d) => d.status === "active");

  /* ------------------------------- Trucks ------------------------------- */
  const truckSeed = [
    { unitNumber: "T-101", equipmentType: "truck", make: "Freightliner", model: "Cascadia", year: 2022, vin: "3AKJHHDR9NSMX4412", status: "active" },
    { unitNumber: "T-102", equipmentType: "truck", make: "Kenworth", model: "T680", year: 2021, vin: "1XKYD49X1MJ448201", status: "active" },
    { unitNumber: "T-103", equipmentType: "truck", make: "Peterbilt", model: "579", year: 2023, vin: "1XPBDP9X5PD882314", status: "active" },
    { unitNumber: "T-104", equipmentType: "truck", make: "Volvo", model: "VNL860", year: 2020, vin: "4V4NC9EH8LN221890", status: "in_shop" },
    { unitNumber: "T-105", equipmentType: "truck", make: "Mack", model: "Anthem", year: 2022, vin: "1M1AN4GY3NM012445", status: "active" },
    { unitNumber: "T-106", equipmentType: "truck", make: "International", model: "LT625", year: 2019, vin: "3HSDZAPR5KN554120", status: "active" },
    { unitNumber: "T-107", equipmentType: "truck", make: "Freightliner", model: "Cascadia", year: 2024, vin: "3AKJHHDR1RSYY7781", status: "active" },
    { unitNumber: "TR-201", equipmentType: "trailer", make: "Great Dane", model: "Champion Dry Van", year: 2021, vin: "1GRAA0625MW118234", status: "active" },
    { unitNumber: "TR-202", equipmentType: "trailer", make: "Wabash", model: "DuraPlate", year: 2022, vin: "1JJV532D1NL209871", status: "active" },
    { unitNumber: "TR-203", equipmentType: "trailer", make: "Utility", model: "3000R Reefer", year: 2020, vin: "1UYVS2530LU336655", status: "active" },
  ];
  const insertedTrucks = await db.insert(trucks).values(truckSeed).returning();
  const roadTrucks = insertedTrucks.filter(
    (t) => t.equipmentType === "truck" && t.status !== "inactive",
  );

  /* ------------------------------- Brokers ------------------------------ */
  const brokerSeed = [
    { companyName: "BlueRidge Logistics", mcNumber: "MC-884120", dotNumber: "3498210", contactName: "Hannah Boyd", phone: "(704) 555-0130", email: "ops@blueridgelog.com", paymentTermsDays: 30 },
    { companyName: "Cardinal Freight Brokerage", mcNumber: "MC-771903", dotNumber: "3110442", contactName: "Marcus Lee", phone: "(502) 555-0163", email: "carriers@cardinalfreight.com", paymentTermsDays: 30 },
    { companyName: "Summit Shippers Co.", mcNumber: "MC-902114", dotNumber: "3655211", contactName: "Priya Nair", phone: "(303) 555-0108", email: "ap@summitshippers.co", paymentTermsDays: 15 },
    { companyName: "Heartland Distribution", mcNumber: "MC-665298", dotNumber: "2981754", contactName: "Greg Ott", phone: "(402) 555-0177", email: "billing@heartlanddist.com", paymentTermsDays: 21 },
    { companyName: "Apex Load Link", mcNumber: "MC-831475", dotNumber: "3409901", contactName: "Dana Kruse", phone: "(913) 555-0124", email: "pay@apexloadlink.com", paymentTermsDays: 30 },
    { companyName: "Meridian Freight Partners", mcNumber: "MC-779640", dotNumber: "3226678", contactName: "Victor Shaw", phone: "(214) 555-0152", email: "ap@meridianfp.com", paymentTermsDays: 45 },
    { companyName: "Stonebridge Logistics", mcNumber: "MC-845233", dotNumber: "3541096", contactName: "Alina Ford", phone: "(615) 555-0191", email: "carrier.pay@stonebridge.io", paymentTermsDays: 30 },
    { companyName: "Gulfline Shippers", mcNumber: "MC-690847", dotNumber: "2870334", contactName: "Trey Boudreaux", phone: "(713) 555-0117", email: "ap@gulflineship.com", paymentTermsDays: 30 },
    { companyName: "NorthPeak Transport Group", mcNumber: "MC-812096", dotNumber: "3367215", contactName: "Sara Lindt", phone: "(612) 555-0148", email: "pay@northpeaktg.com", paymentTermsDays: 2 },
    { companyName: "Silverline Brokerage", mcNumber: "MC-753318", dotNumber: "3058876", contactName: "Omar Diaz", phone: "(602) 555-0186", email: "ap@silverlinebroker.com", paymentTermsDays: 30 },
  ];
  const insertedBrokers = await db.insert(brokers).values(brokerSeed).returning();

  /* -------------------------------- Loads ------------------------------- */
  const loadValues: (typeof loads.$inferInsert)[] = [];
  let loadSeq = 2401;
  const makeLoad = (daysAgoDispatch: number, status: string) => {
    const pu = pick(rnd, LANES);
    let del = pick(rnd, LANES);
    while (del === pu) del = pick(rnd, LANES);
    const miles = Math.round(between(rnd, 180, 1420));
    const rpm = between(rnd, 2.05, 3.45);
    const rate = round2(miles * rpm);
    const transitDays = Math.max(1, Math.round(miles / 520));
    const dispatchDate = isoDaysAgo(daysAgoDispatch);
    const deliveryDate =
      status === "delivered"
        ? isoDaysAgo(Math.max(0, daysAgoDispatch - transitDays))
        : status === "in_transit"
          ? null
          : null;
    /* BOL + factoring realism keyed off age/status */
    let bolStatus = "pending";
    let factoringStatus = "not_submitted";
    if (status === "delivered") {
      const age = daysAgoDispatch - transitDays;
      const roll = rnd();
      bolStatus = age > 20 ? (roll < 0.9 ? "signed" : "delivered") : age > 7 ? (roll < 0.6 ? "signed" : roll < 0.85 ? "delivered" : "pending") : (roll < 0.25 ? "signed" : roll < 0.6 ? "delivered" : "pending");
      const froll = rnd();
      factoringStatus = age > 35 ? (froll < 0.97 ? "funded" : "rejected") : age > 18 ? (froll < 0.55 ? "funded" : froll < 0.8 ? "approved" : froll < 0.92 ? "submitted" : "not_submitted") : age > 8 ? (froll < 0.4 ? "submitted" : froll < 0.7 ? "approved" : froll < 0.85 ? "funded" : "not_submitted") : (froll < 0.55 ? "not_submitted" : froll < 0.85 ? "submitted" : "approved");
    }
    const driver = pick(rnd, activeDrivers);
    loadValues.push({
      loadNumber: `LD-${loadSeq++}`,
      brokerId: pick(rnd, insertedBrokers).id,
      driverId: driver.id,
      truckId: pick(rnd, roadTrucks).id,
      pickupLocation: pu,
      deliveryLocation: del,
      miles,
      rate: String(rate),
      dispatchDate,
      deliveryDate,
      status,
      bolNumber: `BOL-${89000 + loadSeq * 7 + Math.floor(rnd() * 90)}`,
      bolDocUrl: status === "delivered" && rnd() < 0.7 ? `https://docs.ironhaul.co/bol/${89000 + loadSeq * 7}.pdf` : "",
      bolStatus,
      factoringStatus,
      factoringFeePct: pick(rnd, ["2.50", "2.75", "2.75", "3.00", "3.25"]),
      notes: rnd() < 0.18 ? "Detention approved after 3 hrs — broker to confirm." : "",
      createdAt: new Date(Date.now() - daysAgoDispatch * 86400000),
    });
  };
  /* 118 delivered across the past ~150 days (healthy utilization for 7 tractors) */
  for (let i = 0; i < 118; i++) makeLoad(3 + rnd() * 148, "delivered");
  /* 6 currently rolling */
  for (let i = 0; i < 6; i++) makeLoad(rnd() * 4 + 0.5, "in_transit");
  /* 4 fresh bookings headed out */
  for (let i = 0; i < 4; i++) {
    makeLoad(-(rnd() * 5 + 1), "booked");
  }
  await db.insert(loads).values(loadValues);

  /* ----------------------------- Maintenance ---------------------------- */
  const repairTypes = [
    "PM service", "Brakes & drums", "Tire replacement (steer)", "A/C compressor",
    "Alternator replacement", "Coolant leak", "DEF system repair", "Clutch kit",
    "DOT inspection repair", "Electrical diagnostics", "Air bag suspension",
    "Wheel seals", "Turbo actuator", "EGR valve cleaning",
  ];
  const shops = [
    "TA Petro — Gary, IN", "Rush Truck Center — Columbus, OH", "MHC Kenworth — Dallas, TX",
    "FleetPride Service — Atlanta, GA", "Boss Truck Shop — OKC, OK", "Ironline Diesel — Kansas City, MO",
  ];
  const maintValues: (typeof maintenance.$inferInsert)[] = [];
  for (let i = 0; i < 14; i++) {
    const inProgress = i >= 12;
    maintValues.push({
      truckId: pick(rnd, roadTrucks).id,
      serviceDate: isoDaysAgo(inProgress ? rnd() * 6 : 8 + rnd() * 140),
      repairType: pick(rnd, repairTypes),
      description: pick(rnd, [
        "Driver reported issue during post-trip inspection.",
        "Preventive maintenance per fleet schedule.",
        "Roadside breakdown — towed to shop.",
        "Flagged during annual DOT inspection.",
        "",
      ]),
      /* most jobs are routine; occasionally a big-ticket repair */
      cost: String(round2(rnd() < 0.82 ? between(rnd, 180, 1600) : between(rnd, 2200, 4400))),
      shop: pick(rnd, shops),
      status: inProgress ? "in_progress" : "completed",
      odometer: Math.round(between(rnd, 180000, 640000)),
    });
  }
  await db.insert(maintenance).values(maintValues);

  /* ------------------------------ Expenses ------------------------------ */
  const expenseValues: (typeof expenses.$inferInsert)[] = [];
  for (let day = 148; day >= 0; day -= 2) {
    expenseValues.push({
      expenseDate: isoDaysAgo(day + rnd() * 1.5),
      category: "fuel",
      amount: String(round2(between(rnd, 720, 1050))),
      description: `Diesel — ${pick(rnd, ["Pilot", "Loves", "TA", "Flying J", "Petro"])}`,
      truckId: pick(rnd, roadTrucks).id,
    });
  }
  for (let m = 5; m >= 0; m--) {
    expenseValues.push({
      expenseDate: isoDaysAgo(m * 30 + 2),
      category: "insurance",
      amount: "5800.00",
      description: "Auto liability + cargo premium — fleet monthly",
      truckId: null,
    });
    if (m > 0)
      expenseValues.push({
        expenseDate: isoDaysAgo(m * 30 + 6),
        category: "office",
        amount: String(round2(between(rnd, 120, 480))),
        description: pick(rnd, ["ELD subscriptions", "Dispatch software", "Office supplies", "Drug consortium fee"]),
        truckId: null,
      });
  }
  for (let q = 4; q >= 1; q--)
    expenseValues.push({
      expenseDate: isoDaysAgo(q * 38),
      category: "ifta",
      amount: String(round2(between(rnd, 720, 1250))),
      description: "Quarterly IFTA fuel tax filing",
      truckId: null,
    });
  for (let i = 0; i < 16; i++)
    expenseValues.push({
      expenseDate: isoDaysAgo(rnd() * 145),
      category: "tolls",
      amount: String(round2(between(rnd, 18, 96))),
      description: pick(rnd, ["Indiana Toll Road", "Ohio Turnpike", "Kansas Turnpike", "E-470 Denver", "Illinois Tollway"]),
      truckId: pick(rnd, roadTrucks).id,
    });
  for (let i = 0; i < 4; i++)
    expenseValues.push({
      expenseDate: isoDaysAgo(20 + rnd() * 120),
      category: "permits",
      amount: String(round2(between(rnd, 85, 550))),
      description: pick(rnd, ["Oversize permit — TX", "IRP apportioned plate renewal", "UCR filing", "KYU highway use tax"]),
      truckId: null,
    });
  await db.insert(expenses).values(expenseValues);

  /* --------------------------- Deductions (old) -------------------------- */
  const dedTypes = ["fuel_advance", "cash_advance", "repair", "escrow", "other"] as const;
  const dedNotes: Record<string, string[]> = {
    fuel_advance: ["Comchek fuel advance", "EFS advance — diesel"],
    cash_advance: ["Lumper fee advance", "Comchek cash advance", "Scale ticket advance"],
    repair: ["Flat repair on TR-202", "Tire blowout chargeback", "Mirror replacement"],
    escrow: ["Weekly escrow contribution"],
    other: ["Parking reimbursement reversal", "Toll violation pass-through"],
  };
  const oldDeductions: (typeof deductions.$inferInsert)[] = [];
  for (let i = 0; i < 14; i++) {
    const t = pick(rnd, dedTypes);
    oldDeductions.push({
      driverId: pick(rnd, activeDrivers).id,
      deductionDate: isoDaysAgo(35 + rnd() * 110),
      type: t,
      amount: String(round2(between(rnd, 60, t === "fuel_advance" ? 700 : 420))),
      note: pick(rnd, dedNotes[t]),
    });
  }
  await db.insert(deductions).values(oldDeductions);

  /* ------------- Settlements: 3 prior 30-day windows per driver --------- */
  const windows: [number, number][] = [[120, 91], [90, 61], [60, 31]];
  for (const [from, to] of windows) {
    for (const d of activeDrivers) {
      try {
        const s = await generateSettlement(d.id, isoDaysAgo(from), isoDaysAgo(to));
        await db
          .update(settlements)
          .set({ status: "paid" })
          .where((await import("drizzle-orm")).eq(settlements.id, s.id));
      } catch {
        /* driver had no payable loads in this window — fine */
      }
    }
  }

  /* ------------------ Fresh open deductions (this week) ------------------ */
  const freshDeductions: (typeof deductions.$inferInsert)[] = [];
  for (let i = 0; i < 6; i++) {
    const t = pick(rnd, ["fuel_advance", "cash_advance", "other"] as const);
    freshDeductions.push({
      driverId: pick(rnd, activeDrivers).id,
      deductionDate: isoDaysAgo(rnd() * 20 + 1),
      type: t,
      amount: String(round2(between(rnd, 75, 500))),
      note: pick(rnd, dedNotes[t]),
    });
  }
  await db.insert(deductions).values(freshDeductions);
}
