/**
 * Finance primitives shared by the settlement engine, stats endpoint and UI.
 */
import { num } from "./util";

export type PayType = "percentage" | "per_mile" | "flat";

export const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: "percentage", label: "% of gross" },
  { value: "per_mile", label: "Per mile" },
  { value: "flat", label: "Flat per load" },
];

/** Driver pay for one load given their configured pay structure. */
export function calcLoadPay(
  payType: string,
  payRate: unknown,
  loadRate: unknown,
  miles: unknown,
): number {
  const rate = num(loadRate);
  const pr = num(payRate);
  const mi = num(miles);
  switch (payType) {
    case "percentage":
      return round2((rate * pr) / 100);
    case "per_mile":
      return round2(mi * pr);
    case "flat":
      return round2(pr);
    default:
      return 0;
  }
}

/** Human-readable driver pay structure label, e.g. "25% of gross". */
export function payStructureLabel(payType: string, payRate: unknown): string {
  const pr = num(payRate);
  if (payType === "percentage") return `${pr}% of linehaul`;
  if (payType === "per_mile") return `$${pr.toFixed(2)} / mile`;
  return `$${pr.toFixed(0)} flat / load`;
}

/** Factoring economics for a load invoice. */
export function factoringNet(rate: unknown, feePct: unknown) {
  const r = num(rate);
  const pct = num(feePct);
  const fee = round2((r * pct) / 100);
  return { fee, net: round2(r - fee) };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------ Enum catalogs ---------------------------- */
export const LOAD_STATUSES = ["booked", "in_transit", "delivered"] as const;
export const BOL_STATUSES = ["pending", "delivered", "signed"] as const;
export const FACTORING_STATUSES = [
  "not_submitted",
  "submitted",
  "approved",
  "funded",
  "rejected",
] as const;
export const DRIVER_STATUSES = ["active", "inactive"] as const;
export const TRUCK_STATUSES = ["active", "in_shop", "inactive"] as const;
export const EQUIPMENT_TYPES = ["truck", "trailer"] as const;
export const MAINTENANCE_STATUSES = ["in_progress", "completed"] as const;

export const EXPENSE_CATEGORIES = [
  { value: "fuel", label: "Fuel" },
  { value: "insurance", label: "Insurance" },
  { value: "ifta", label: "IFTA" },
  { value: "permits", label: "Permits" },
  { value: "office", label: "Office" },
  { value: "tolls", label: "Tolls" },
  { value: "other", label: "Other" },
] as const;

export const DEDUCTION_TYPES = [
  { value: "fuel_advance", label: "Fuel advance" },
  { value: "cash_advance", label: "Cash advance" },
  { value: "repair", label: "Repair chargeback" },
  { value: "escrow", label: "Escrow" },
  { value: "other", label: "Other" },
] as const;
