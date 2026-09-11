/**
 * IRONHAUL OS — Freight Carrier Operations Platform
 * --------------------------------------------------
 * Relational schema (PostgreSQL via Drizzle ORM).
 *
 * Entity graph:
 *   drivers ─┐
 *   trucks ──┼──< loads >── brokers      (loads carry BOL + factoring state)
 *            └──< maintenance            (repairs / downtime per unit)
 *   trucks ───< expenses (optional link, category-coded operational costs)
 *   drivers ──< deductions ──> settlements ──< settlement_items >── loads
 */

import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------- Drivers --------------------------------- */
export const drivers = pgTable("drivers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  licenseNumber: text("license_number").notNull(),
  licenseExpiry: date("license_expiry", { mode: "string" }),
  /** percentage | per_mile | flat */
  payType: text("pay_type").notNull().default("percentage"),
  /** 25 -> 25% of gross | 0.65 -> $0.65/mile | 900 -> $900/load */
  payRate: numeric("pay_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  /** active | inactive */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* --------------------------- Trucks / Trailers ---------------------------- */
export const trucks = pgTable("trucks", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitNumber: text("unit_number").notNull().unique(),
  /** truck | trailer */
  equipmentType: text("equipment_type").notNull().default("truck"),
  make: text("make").notNull().default(""),
  model: text("model").notNull().default(""),
  year: integer("year"),
  vin: text("vin").notNull().default(""),
  /** active | in_shop | inactive */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* --------------------------- Brokers / Shippers --------------------------- */
export const brokers = pgTable("brokers", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: text("company_name").notNull(),
  mcNumber: text("mc_number").notNull().default(""),
  dotNumber: text("dot_number").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  /** days until invoice due (Net N) */
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* --------------------------------- Loads ---------------------------------- */
export const loads = pgTable(
  "loads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    loadNumber: text("load_number").notNull().unique(),
    brokerId: uuid("broker_id").references(() => brokers.id, { onDelete: "set null" }),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "set null" }),
    pickupLocation: text("pickup_location").notNull().default(""),
    deliveryLocation: text("delivery_location").notNull().default(""),
    miles: integer("miles").notNull().default(0),
    rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
    dispatchDate: date("dispatch_date", { mode: "string" }),
    deliveryDate: date("delivery_date", { mode: "string" }),
    /** booked | in_transit | delivered */
    status: text("status").notNull().default("booked"),
    /* Bill of Lading tracking */
    bolNumber: text("bol_number").notNull().default(""),
    bolDocUrl: text("bol_doc_url").notNull().default(""),
    /** pending | delivered | signed */
    bolStatus: text("bol_status").notNull().default("pending"),
    /* Factoring pipeline: not_submitted | submitted | approved | funded | rejected */
    factoringStatus: text("factoring_status").notNull().default("not_submitted"),
    /** factoring fee, percent of face value (e.g. 2.75) */
    factoringFeePct: numeric("factoring_fee_pct", { precision: 6, scale: 2 })
      .notNull()
      .default("2.75"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("loads_driver_idx").on(t.driverId),
    index("loads_truck_idx").on(t.truckId),
    index("loads_broker_idx").on(t.brokerId),
    index("loads_fact_idx").on(t.factoringStatus),
  ],
);

/* ------------------------------ Maintenance ------------------------------- */
export const maintenance = pgTable(
  "maintenance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "cascade" }),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    repairType: text("repair_type").notNull(),
    description: text("description").notNull().default(""),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
    shop: text("shop").notNull().default(""),
    /** in_progress | completed  (in_progress => unit is down) */
    status: text("status").notNull().default("completed"),
    odometer: integer("odometer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("maint_truck_idx").on(t.truckId)],
);

/* --------------------------- General Expenses ----------------------------- */
export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  expenseDate: date("expense_date", { mode: "string" }).notNull(),
  /** fuel | insurance | ifta | permits | office | tolls | other */
  category: text("category").notNull().default("other"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description").notNull().default(""),
  truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------------------------- Driver deductions --------------------------- */
export const deductions = pgTable(
  "deductions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }),
    deductionDate: date("deduction_date", { mode: "string" }).notNull(),
    /** fuel_advance | cash_advance | repair | escrow | other */
    type: text("type").notNull().default("other"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note").notNull().default(""),
    /** linked once a settlement is generated; null = open / unsettled */
    settlementId: uuid("settlement_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ded_driver_idx").on(t.driverId)],
);

/* ------------------------------- Settlements ------------------------------ */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    settlementNumber: text("settlement_number").notNull().unique(),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "restrict" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    grossPay: numeric("gross_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    /** snapshot of pay structure at generation time */
    payTypeSnapshot: text("pay_type_snapshot").notNull().default("percentage"),
    payRateSnapshot: numeric("pay_rate_snapshot", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** draft | paid */
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("settle_driver_idx").on(t.driverId)],
);

/* Itemized settlement lines — one row per settled load, plus deduction lines. */
export const settlementItems = pgTable(
  "settlement_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    loadId: uuid("load_id").references(() => loads.id, { onDelete: "set null" }),
    /** load | deduction */
    kind: text("kind").notNull().default("load"),
    description: text("description").notNull().default(""),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("items_settle_idx").on(t.settlementId)],
);
