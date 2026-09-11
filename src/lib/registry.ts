/**
 * Entity registry — single source of truth that powers the generic
 * /api/[entity] CRUD routes. Each entry wires a Drizzle table to a Zod
 * validation schema and (optionally) a custom list query with joins.
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  brokers,
  deductions,
  drivers,
  expenses,
  loads,
  maintenance,
  trucks,
} from "@/db/schema";
import {
  BOL_STATUSES,
  DRIVER_STATUSES,
  EQUIPMENT_TYPES,
  FACTORING_STATUSES,
  LOAD_STATUSES,
  MAINTENANCE_STATUSES,
  TRUCK_STATUSES,
} from "@/lib/finance";

/* --------------------------- Zod field helpers --------------------------- */
/** Optional text that collapses null/undefined to "" */
const optStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim());
/** Required non-empty text */
const reqStr = z.string().trim().min(1, "Required");
/** Optional nullable value — "" becomes null (dates, FK ids) */
const optNullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));
/** Money / decimal, defaults to 0, must be >= 0 when required */
const money = z.coerce.number().finite().min(0, "Must be ≥ 0").default(0);
/** Optional nullable number (odometer, year) */
const optNum = z
  .union([z.coerce.number().finite(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined ? null : v));
const emailStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Invalid email address");

/* ------------------------------ Schemas ---------------------------------- */
export const driverSchema = z.object({
  name: reqStr,
  phone: optStr,
  email: emailStr,
  licenseNumber: reqStr,
  licenseExpiry: optNullableStr,
  payType: z.enum(["percentage", "per_mile", "flat"]).default("percentage"),
  payRate: money,
  status: z.enum(DRIVER_STATUSES).default("active"),
});

export const truckSchema = z.object({
  unitNumber: reqStr,
  equipmentType: z.enum(EQUIPMENT_TYPES).default("truck"),
  make: optStr,
  model: optStr,
  year: optNum,
  vin: optStr,
  status: z.enum(TRUCK_STATUSES).default("active"),
});

export const brokerSchema = z.object({
  companyName: reqStr,
  mcNumber: optStr,
  dotNumber: optStr,
  contactName: optStr,
  phone: optStr,
  email: emailStr,
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(30),
});

export const loadSchema = z.object({
  loadNumber: reqStr,
  brokerId: optNullableStr,
  driverId: optNullableStr,
  truckId: optNullableStr,
  pickupLocation: optStr,
  deliveryLocation: optStr,
  miles: z.coerce.number().int().min(0).default(0),
  rate: money,
  dispatchDate: optNullableStr,
  deliveryDate: optNullableStr,
  status: z.enum(LOAD_STATUSES).default("booked"),
  bolNumber: optStr,
  bolDocUrl: optStr,
  bolStatus: z.enum(BOL_STATUSES).default("pending"),
  factoringStatus: z.enum(FACTORING_STATUSES).default("not_submitted"),
  factoringFeePct: z.coerce.number().finite().min(0).max(15).default(2.75),
  notes: optStr,
});

export const maintenanceSchema = z.object({
  truckId: optNullableStr,
  serviceDate: reqStr,
  repairType: reqStr,
  description: optStr,
  cost: money,
  shop: optStr,
  status: z.enum(MAINTENANCE_STATUSES).default("completed"),
  odometer: optNum,
});

export const expenseSchema = z.object({
  expenseDate: reqStr,
  category: z.enum(["fuel", "insurance", "ifta", "permits", "office", "tolls", "other"]).default("other"),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  description: optStr,
  truckId: optNullableStr,
});

export const deductionSchema = z.object({
  driverId: reqStr,
  deductionDate: reqStr,
  type: z.enum(["fuel_advance", "cash_advance", "repair", "escrow", "other"]).default("other"),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  note: optStr,
});

/* ----------------------------- List loaders ------------------------------ */
export async function listLoads() {
  const rows = await db
    .select({
      load: loads,
      driverName: drivers.name,
      truckUnit: trucks.unitNumber,
      brokerName: brokers.companyName,
      brokerTerms: brokers.paymentTermsDays,
    })
    .from(loads)
    .leftJoin(drivers, eq(loads.driverId, drivers.id))
    .leftJoin(trucks, eq(loads.truckId, trucks.id))
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .orderBy(desc(loads.createdAt));
  return rows.map((r) => ({
    ...r.load,
    driverName: r.driverName,
    truckUnit: r.truckUnit,
    brokerName: r.brokerName,
    brokerTerms: r.brokerTerms,
  }));
}

export async function listMaintenance() {
  const rows = await db
    .select({ rec: maintenance, truckUnit: trucks.unitNumber })
    .from(maintenance)
    .leftJoin(trucks, eq(maintenance.truckId, trucks.id))
    .orderBy(desc(maintenance.serviceDate));
  return rows.map((r) => ({ ...r.rec, truckUnit: r.truckUnit }));
}

export async function listExpenses() {
  const rows = await db
    .select({ rec: expenses, truckUnit: trucks.unitNumber })
    .from(expenses)
    .leftJoin(trucks, eq(expenses.truckId, trucks.id))
    .orderBy(desc(expenses.expenseDate));
  return rows.map((r) => ({ ...r.rec, truckUnit: r.truckUnit }));
}

export async function listDeductions() {
  const rows = await db
    .select({ rec: deductions, driverName: drivers.name })
    .from(deductions)
    .leftJoin(drivers, eq(deductions.driverId, drivers.id))
    .orderBy(desc(deductions.deductionDate));
  return rows.map((r) => ({ ...r.rec, driverName: r.driverName }));
}

/* ------------------------------- Registry -------------------------------- */
export type EntityDef = {
  table: unknown;
  schema: z.ZodObject<z.ZodRawShape>;
  list?: () => Promise<unknown[]>;
};

export const REGISTRY: Record<string, EntityDef> = {
  drivers: { table: drivers, schema: driverSchema },
  trucks: { table: trucks, schema: truckSchema },
  brokers: { table: brokers, schema: brokerSchema },
  loads: { table: loads, schema: loadSchema, list: listLoads },
  maintenance: { table: maintenance, schema: maintenanceSchema, list: listMaintenance },
  expenses: { table: expenses, schema: expenseSchema, list: listExpenses },
  deductions: { table: deductions, schema: deductionSchema, list: listDeductions },
};
