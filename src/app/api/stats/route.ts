/**
 * GET /api/stats — dashboard analytics.
 * Aggregates KPIs, chart series and the "action center" feed in one request.
 * Auto-seeds the demo dataset the first time the app boots with an empty DB.
 */
import { db } from "@/db";
import { drivers, trucks } from "@/db/schema";
import { calcLoadPay, factoringNet, round2 } from "@/lib/finance";
import { listExpenses, listLoads, listMaintenance } from "@/lib/registry";
import { isDatabaseEmpty, seed } from "@/lib/seed";
import { daysSince, num } from "@/lib/util";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-01-15" -> "2026-01" */
const mkey = (d?: string | null) => (d ? d.slice(0, 7) : null);

export async function GET() {
  try {
    if (await isDatabaseEmpty()) await seed();

    const [allLoads, allExpenses, allMaintenance, allDrivers, allTrucks] =
      await Promise.all([
        listLoads(),
        listExpenses(),
        listMaintenance(),
        db.select().from(drivers),
        db.select().from(trucks),
      ]);

    const driverById = new Map(allDrivers.map((d) => [d.id, d]));
    const delivered = allLoads.filter((l) => l.status === "delivered");

    /* ----------------------------- KPI rollup ---------------------------- */
    const grossRevenue = delivered.reduce((s, l) => s + num(l.rate), 0);
    const estDriverPay = delivered.reduce((s, l) => {
      const d = l.driverId ? driverById.get(l.driverId) : undefined;
      return s + (d ? calcLoadPay(d.payType, d.payRate, l.rate, l.miles) : 0);
    }, 0);
    const expenseTotal = allExpenses.reduce((s, e) => s + num(e.amount), 0);
    const maintTotal = allMaintenance.reduce((s, m) => s + num(m.cost), 0);
    const totalOpex = expenseTotal + maintTotal + estDriverPay;
    const netProfit = grossRevenue - totalOpex;

    const openARLoads = delivered.filter((l) => l.factoringStatus !== "funded");
    const outstandingAR = openARLoads.reduce((s, l) => s + num(l.rate), 0);
    const awaitingFunding = delivered.filter(
      (l) => l.factoringStatus === "submitted" || l.factoringStatus === "approved",
    );
    const factoringFeesHeld = awaitingFunding.reduce(
      (s, l) => s + factoringNet(l.rate, l.factoringFeePct).fee,
      0,
    );

    /* ------------------------- Monthly P&L buckets ----------------------- */
    const buckets = new Map<
      string,
      { key: string; label: string; revenue: number; expenses: number; driverPay: number; net: number }
    >();
    const bucket = (key: string) => {
      let b = buckets.get(key);
      if (!b) {
        const [y, m] = key.split("-").map(Number);
        b = { key, label: `${MONTH_LABELS[m - 1]} '${String(y).slice(2)}`, revenue: 0, expenses: 0, driverPay: 0, net: 0 };
        buckets.set(key, b);
      }
      return b;
    };
    delivered.forEach((l) => {
      const k = mkey(l.deliveryDate);
      if (!k) return;
      const d = l.driverId ? driverById.get(l.driverId) : undefined;
      bucket(k).revenue += num(l.rate);
      if (d) bucket(k).driverPay += calcLoadPay(d.payType, d.payRate, l.rate, l.miles);
    });
    allExpenses.forEach((e) => {
      const k = mkey(e.expenseDate);
      if (k) bucket(k).expenses += num(e.amount);
    });
    allMaintenance.forEach((m) => {
      const k = mkey(m.serviceDate);
      if (k) bucket(k).expenses += num(m.cost);
    });
    const nowKey = mkey(new Date().toISOString().slice(0, 10))!;
    bucket(nowKey); // ensure current month present
    const monthly = [...buckets.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-9)
      .map((b) => ({
        ...b,
        revenue: round2(b.revenue),
        expenses: round2(b.expenses + b.driverPay),
        net: round2(b.revenue - b.expenses - b.driverPay),
        driverPay: round2(b.driverPay),
      }));

    /* --------------------------- Revenue by truck ------------------------ */
    const byTruck = new Map<string, { unit: string; revenue: number; loads: number; miles: number }>();
    delivered.forEach((l) => {
      if (!l.truckId) return;
      const t = allTrucks.find((x) => x.id === l.truckId);
      const key = t?.unitNumber ?? "—";
      const cur = byTruck.get(l.truckId) ?? { unit: key, revenue: 0, loads: 0, miles: 0 };
      cur.revenue += num(l.rate);
      cur.loads += 1;
      cur.miles += l.miles;
      byTruck.set(l.truckId, cur);
    });
    const revenueByTruck = [...byTruck.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((t) => ({ ...t, revenue: round2(t.revenue), rpm: t.miles ? round2(t.revenue / t.miles) : 0 }));

    /* ------------------------------ Top brokers -------------------------- */
    const byBroker = new Map<string, { name: string; revenue: number; loads: number }>();
    delivered.forEach((l) => {
      const name = l.brokerName ?? "Unknown";
      const cur = byBroker.get(name) ?? { name, revenue: 0, loads: 0 };
      cur.revenue += num(l.rate);
      cur.loads += 1;
      byBroker.set(name, cur);
    });
    const topBrokers = [...byBroker.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map((b) => ({ ...b, revenue: round2(b.revenue) }));

    /* --------------------------- Expense mix donut ----------------------- */
    const catMap = new Map<string, number>();
    allExpenses.forEach((e) => catMap.set(e.category, (catMap.get(e.category) ?? 0) + num(e.amount)));
    catMap.set("maintenance", (catMap.get("maintenance") ?? 0) + maintTotal);
    const expenseByCategory = [...catMap.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    /* ----------------------------- Action feed --------------------------- */
    const needsBol = delivered.filter((l) => l.bolStatus !== "signed");
    const staleUnsubmitted = delivered.filter(
      (l) => l.factoringStatus === "not_submitted" && daysSince(l.deliveryDate) > 5,
    );
    const agingFunding = awaitingFunding
      .filter((l) => daysSince(l.deliveryDate) > 14)
      .sort((a, b) => daysSince(b.deliveryDate) - daysSince(a.deliveryDate));
    const downUnits = allMaintenance.filter((m) => m.status === "in_progress");
    const actionFeed = [
      ...staleUnsubmitted.slice(0, 4).map((l) => ({
        id: `ar-${l.id}`,
        kind: "factoring" as const,
        title: `Submit invoice to factor — ${l.loadNumber}`,
        detail: `${l.brokerName ?? "Broker"} · delivered ${l.deliveryDate ?? "?"} · aged ${daysSince(l.deliveryDate)}d`,
        amount: num(l.rate),
      })),
      ...needsBol.slice(0, 4).map((l) => ({
        id: `bol-${l.id}`,
        kind: "bol" as const,
        title: `Chase signed BOL — ${l.loadNumber}`,
        detail: `${l.pickupLocation} → ${l.deliveryLocation} · BOL ${l.bolNumber || "missing"}`,
        amount: num(l.rate),
      })),
      ...agingFunding.slice(0, 3).map((l) => ({
        id: `fund-${l.id}`,
        kind: "funding" as const,
        title: `Escalate funding — ${l.loadNumber} (${l.factoringStatus})`,
        detail: `${l.brokerName ?? "Broker"} · outstanding ${daysSince(l.deliveryDate)} days`,
        amount: factoringNet(l.rate, l.factoringFeePct).net,
      })),
      ...downUnits.map((m) => ({
        id: `shop-${m.id}`,
        kind: "maintenance" as const,
        title: `Unit down — ${m.truckUnit ?? "unassigned"}: ${m.repairType}`,
        detail: `${m.shop || "Shop TBD"} · since ${m.serviceDate}`,
        amount: num(m.cost),
      })),
    ];

    return Response.json({
      kpis: {
        grossRevenue: round2(grossRevenue),
        totalOpex: round2(totalOpex),
        netProfit: round2(netProfit),
        outstandingAR: round2(outstandingAR),
        estDriverPay: round2(estDriverPay),
        expenseTotal: round2(expenseTotal),
        maintTotal: round2(maintTotal),
        factoringFeesHeld: round2(factoringFeesHeld),
        activeLoads: allLoads.filter((l) => l.status !== "delivered").length,
        deliveredCount: delivered.length,
        totalMiles: delivered.reduce((s, l) => s + l.miles, 0),
        activeDrivers: allDrivers.filter((d) => d.status === "active").length,
        fleetUtilization: allTrucks.length
          ? round2((allTrucks.filter((t) => t.status === "active" && t.equipmentType === "truck").length / Math.max(1, allTrucks.filter((t) => t.equipmentType === "truck").length)) * 100)
          : 0,
        rpm: delivered.length
          ? round2(grossRevenue / Math.max(1, delivered.reduce((s, l) => s + l.miles, 0)))
          : 0,
      },
      monthly,
      revenueByTruck,
      topBrokers,
      expenseByCategory,
      actionFeed,
      recentLoads: allLoads.slice(0, 7),
    });
  } catch (e) {
    console.error("GET /api/stats", e);
    return Response.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
