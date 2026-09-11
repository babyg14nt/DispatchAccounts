/**
 * Settlement engine — generates an itemized driver settlement statement:
 *  • Collects delivered, not-yet-settled loads in the period
 *  • Computes pay per load from the driver's pay structure (snapshotted)
 *  • Sweeps all open deductions dated on/before the period end
 *  • Persists settlement + line items and closes the deductions
 */
import { and, desc, eq, isNull, lte, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  deductions,
  drivers,
  loads,
  settlementItems,
  settlements,
} from "@/db/schema";
import { calcLoadPay, round2 } from "@/lib/finance";
import { num } from "@/lib/util";

export class SettlementError extends Error {}

export async function generateSettlement(
  driverId: string,
  periodStart: string,
  periodEnd: string,
) {
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
  if (!driver) throw new SettlementError("Driver not found");

  /* Delivered loads in the settlement window */
  const periodLoads = await db
    .select()
    .from(loads)
    .where(
      and(
        eq(loads.driverId, driverId),
        eq(loads.status, "delivered"),
        gte(loads.deliveryDate, periodStart),
        lte(loads.deliveryDate, periodEnd),
      ),
    );

  /* Exclude loads already attached to any settlement for this driver */
  const settledRows = await db
    .select({ loadId: settlementItems.loadId })
    .from(settlementItems)
    .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
    .where(eq(settlements.driverId, driverId));
  const settledIds = new Set(
    settledRows.map((r) => r.loadId).filter((v): v is string => Boolean(v)),
  );
  const payable = periodLoads.filter((l) => !settledIds.has(l.id));

  /* Open deductions dated on/before the period end */
  const openDeductions = await db
    .select()
    .from(deductions)
    .where(
      and(
        eq(deductions.driverId, driverId),
        isNull(deductions.settlementId),
        lte(deductions.deductionDate, periodEnd),
      ),
    );

  if (payable.length === 0 && openDeductions.length === 0) {
    throw new SettlementError(
      "No delivered, unsettled loads (or open deductions) in this date range.",
    );
  }

  const lines = payable.map((l) => {
    const amount = calcLoadPay(driver.payType, driver.payRate, l.rate, l.miles);
    return {
      load: l,
      amount,
      description: `${l.loadNumber} · ${l.pickupLocation || "?"} → ${l.deliveryLocation || "?"}`,
    };
  });

  const grossPay = round2(lines.reduce((s, x) => s + x.amount, 0));
  const totalDeductions = round2(
    openDeductions.reduce((s, d) => s + num(d.amount), 0),
  );
  const netPay = round2(grossPay - totalDeductions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(settlements);
  const settlementNumber = `STL-${String(Number(count) + 1).padStart(4, "0")}`;

  const [settlement] = await db
    .insert(settlements)
    .values({
      settlementNumber,
      driverId,
      periodStart,
      periodEnd,
      grossPay: String(grossPay),
      totalDeductions: String(totalDeductions),
      netPay: String(netPay),
      payTypeSnapshot: driver.payType,
      payRateSnapshot: driver.payRate,
      status: "draft",
    })
    .returning();

  /* Line items — loads (+) and deductions (−) so Σitems = net */
  const itemValues = [
    ...lines.map((x) => ({
      settlementId: settlement.id,
      loadId: x.load.id,
      kind: "load",
      description: x.description,
      amount: String(x.amount),
    })),
    ...openDeductions.map((d) => ({
      settlementId: settlement.id,
      loadId: null as string | null,
      kind: "deduction",
      description: `${d.note || d.type.replace(/_/g, " ")} · ${d.deductionDate}`,
      amount: String(-round2(num(d.amount))),
    })),
  ];
  if (itemValues.length) await db.insert(settlementItems).values(itemValues);

  /* Close the swept deductions */
  if (openDeductions.length) {
    await db
      .update(deductions)
      .set({ settlementId: settlement.id })
      .where(
        and(
          eq(deductions.driverId, driverId),
          isNull(deductions.settlementId),
          lte(deductions.deductionDate, periodEnd),
        ),
      );
  }

  return await getSettlementBundle(settlement.id);
}

export async function getSettlementBundle(id: string) {
  const [row] = await db
    .select({ rec: settlements, driverName: drivers.name, driverPayType: drivers.payType })
    .from(settlements)
    .leftJoin(drivers, eq(settlements.driverId, drivers.id))
    .where(eq(settlements.id, id));
  if (!row) throw new SettlementError("Settlement not found");
  const items = await db
    .select()
    .from(settlementItems)
    .where(eq(settlementItems.settlementId, id))
    .orderBy(desc(settlementItems.kind));
  return { ...row.rec, driverName: row.driverName, items };
}

export async function listSettlements() {
  const rows = await db
    .select({ rec: settlements, driverName: drivers.name })
    .from(settlements)
    .leftJoin(drivers, eq(settlements.driverId, drivers.id))
    .orderBy(desc(settlements.createdAt));
  const out = [];
  for (const r of rows) {
    const items = await db
      .select()
      .from(settlementItems)
      .where(eq(settlementItems.settlementId, r.rec.id))
      .orderBy(desc(settlementItems.kind));
    out.push({ ...r.rec, driverName: r.driverName, items });
  }
  return out;
}
