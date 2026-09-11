import { clsx, type ClassValue } from "clsx";

/** Merge class names. */
export function cn(...inputs: ClassValue[]) {
  return clsx(...inputs);
}

/** Parse a Drizzle numeric column (string | number) safely. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

const money0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const money2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMoney(v: unknown, cents = false): string {
  return (cents ? money2 : money0).format(num(v));
}

export function fmtNumber(v: unknown): string {
  return new Intl.NumberFormat("en-US").format(num(v));
}

/** Format a YYYY-MM-DD (or ISO) date string without timezone shifts. */
export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const dt = m
    ? new Date(+m[1], +m[2] - 1, +m[3])
    : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Today's date as YYYY-MM-DD (local). */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Days between a YYYY-MM-DD date and today (positive = past). */
export function daysSince(d?: string | null): number {
  if (!d) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const dt = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

/* ------------------------------ Status tones ----------------------------- */
export type Tone = "zinc" | "sky" | "amber" | "emerald" | "rose" | "violet" | "orange";

export function loadStatusTone(s: string): Tone {
  return s === "delivered" ? "emerald" : s === "in_transit" ? "amber" : "sky";
}
export function bolTone(s: string): Tone {
  return s === "signed" ? "emerald" : s === "delivered" ? "sky" : "amber";
}
export function factoringTone(s: string): Tone {
  switch (s) {
    case "funded": return "emerald";
    case "approved": return "violet";
    case "submitted": return "sky";
    case "rejected": return "rose";
    default: return "zinc";
  }
}
export function entityStatusTone(s: string): Tone {
  if (s === "active") return "emerald";
  if (s === "in_shop" || s === "in_progress") return "rose";
  return "zinc";
}

export const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  in_transit: "In Transit",
  delivered: "Delivered",
  pending: "Pending",
  signed: "Signed",
  not_submitted: "Not Submitted",
  submitted: "Submitted",
  approved: "Approved",
  funded: "Funded",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  in_shop: "In Shop",
  in_progress: "In Progress",
  completed: "Completed",
  draft: "Draft",
  paid: "Paid",
};

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
