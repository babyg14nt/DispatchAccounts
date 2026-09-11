"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Download,
  FileSignature,
  Gauge,
  Landmark,
  Route,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { StatsPayload } from "@/lib/types";
import {
  cn,
  fmtDate,
  fmtMoney,
  fmtNumber,
  loadStatusTone,
  num,
  statusLabel,
} from "@/lib/util";
import {
  Card,
  PageHeader,
  PageLoading,
  Pill,
  SectionHead,
  Stat,
} from "@/components/ui";
import {
  CATEGORY_COLORS,
  ExpenseDonut,
  LegendItem,
  MonthlyPnLChart,
  RevenueByTruckChart,
  TopBrokersChart,
} from "@/components/charts";
import { useToast } from "@/components/toast";

const FEED_ICON = {
  factoring: { icon: Landmark, classes: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
  bol: { icon: FileSignature, classes: "bg-sky-400/10 text-sky-400 border-sky-400/20" },
  funding: { icon: AlertTriangle, classes: "bg-rose-400/10 text-rose-400 border-rose-400/20" },
  maintenance: { icon: Wrench, classes: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20" },
} as const;

export default function DashboardPage() {
  const toast = useToast();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api<StatsPayload>("/api/stats"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportPnL = () => {
    if (!stats) return;
    downloadCsv("ironhaul_monthly_pnl.csv", stats.monthly.map((m) => ({
      Month: m.label,
      "Gross Revenue": m.revenue,
      "Operating Expenses": m.expenses,
      "Driver Pay (in OPEX)": m.driverPay,
      "Net Profit": m.net,
    })));
    toast.success("Monthly P&L exported");
  };

  const exportLoads = async () => {
    try {
      const loads = await api<any[]>("/api/loads");
      downloadCsv("ironhaul_loads.csv", loads.map((l) => ({
        "Load #": l.loadNumber,
        Broker: l.brokerName ?? "",
        Driver: l.driverName ?? "",
        Truck: l.truckUnit ?? "",
        "Pickup": l.pickupLocation,
        "Delivery": l.deliveryLocation,
        Miles: l.miles,
        "Rate (USD)": num(l.rate).toFixed(2),
        "Dispatch Date": l.dispatchDate ?? "",
        "Delivery Date": l.deliveryDate ?? "",
        Status: statusLabel(l.status),
        "BOL #": l.bolNumber,
        "BOL Status": statusLabel(l.bolStatus),
        "Factoring Status": statusLabel(l.factoringStatus),
        "Factoring Fee %": num(l.factoringFeePct).toFixed(2),
      })));
      toast.success("Load register exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (error)
    return (
      <div className="card mx-auto mt-24 max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 text-rose-400" size={22} />
        <div className="font-semibold text-zinc-200">Dashboard failed to load</div>
        <p className="mt-1 text-[13px] text-zinc-500">{error}</p>
        <button className="btn btn-primary mt-5" onClick={load}>Retry</button>
      </div>
    );
  if (!stats) return <PageLoading />;

  const k = stats.kpis;
  const margin = k.grossRevenue > 0 ? (k.netProfit / k.grossRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Command Center"
        title="Operations Dashboard"
        sub="Live P&L, fleet performance and receivables across the whole operation."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportLoads}>
              <Download size={14} /> Loads CSV
            </button>
            <button className="btn btn-primary" onClick={exportPnL}>
              <Download size={14} /> Export P&L
            </button>
          </>
        }
      />

      {/* ------------------------------- KPI row ---------------------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          index={0}
          label="Gross Revenue"
          value={k.grossRevenue}
          icon={Banknote}
          tone="amber"
          sub={`${fmtNumber(k.deliveredCount)} loads delivered · $${k.rpm.toFixed(2)}/mi avg`}
        />
        <Stat
          index={1}
          label="Operating Expenses"
          value={k.totalOpex}
          icon={Wallet}
          tone="rose"
          sub={`Driver pay ${fmtMoney(k.estDriverPay)} · Maint ${fmtMoney(k.maintTotal)}`}
        />
        <Stat
          index={2}
          label="Net Profit"
          value={k.netProfit}
          icon={TrendingUp}
          tone={k.netProfit >= 0 ? "emerald" : "rose"}
          sub={`${margin.toFixed(1)}% operating margin on delivered freight`}
        />
        <Stat
          index={3}
          label="Outstanding AR"
          value={k.outstandingAR}
          icon={Landmark}
          tone="sky"
          sub={`${fmtMoney(k.factoringFeesHeld)} in factor fees pending funding`}
        />
      </div>

      {/* ----------------------------- Chart row 1 -------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="rise p-5 xl:col-span-3" style={{ animationDelay: "120ms" }}>
          <SectionHead
            title="Revenue vs. Expenses"
            right={
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                trailing months
              </span>
            }
          />
          <MonthlyPnLChart data={stats.monthly} />
        </Card>
        <Card className="rise p-5 xl:col-span-2" style={{ animationDelay: "170ms" }}>
          <SectionHead
            title="Revenue per Truck"
            right={
              <Link href="/trucks" className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-amber-500 hover:text-amber-300">
                Fleet <ArrowRight size={11} />
              </Link>
            }
          />
          <RevenueByTruckChart data={stats.revenueByTruck} />
        </Card>
      </div>

      {/* ----------------------------- Chart row 2 -------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rise p-5" style={{ animationDelay: "220ms" }}>
          <SectionHead title="Top Brokers" />
          <TopBrokersChart data={stats.topBrokers} />
        </Card>

        <Card className="rise p-5" style={{ animationDelay: "260ms" }}>
          <SectionHead
            title="Expense Mix"
            right={
              <Link href="/expenses" className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-amber-500 hover:text-amber-300">
                Ledger <ArrowRight size={11} />
              </Link>
            }
          />
          <div className="flex items-center gap-4">
            <div className="w-1/2 shrink-0">
              <ExpenseDonut data={stats.expenseByCategory} size={200} />
            </div>
            <div className="flex-1 space-y-2.5 overflow-hidden">
              {stats.expenseByCategory.slice(0, 6).map((c) => (
                <LegendItem
                  key={c.category}
                  color={CATEGORY_COLORS[c.category] ?? "#64748b"}
                  label={statusLabel(c.category)}
                  value={fmtMoney(c.amount)}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card className="rise flex flex-col p-5" style={{ animationDelay: "300ms" }}>
          <SectionHead
            title="Dispatch Radar"
            right={
              <span className="pill tone-amber">{stats.actionFeed.length} open</span>
            }
          />
          <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 260 }}>
            {stats.actionFeed.length === 0 && (
              <div className="py-10 text-center text-[12.5px] text-zinc-600">
                All clear — nothing needs attention.
              </div>
            )}
            {stats.actionFeed.map((a) => {
              const cfg = FEED_ICON[a.kind];
              const Icon = cfg.icon;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", cfg.classes)}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-zinc-200">{a.title}</div>
                    <div className="truncate text-[11px] text-zinc-500">{a.detail}</div>
                  </div>
                  <span className="mono shrink-0 text-[12px] font-semibold text-zinc-300">
                    {fmtMoney(a.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ------------------------- Utilization strip ------------------------ */}
      <div className="rise grid grid-cols-2 gap-4 md:grid-cols-4" style={{ animationDelay: "340ms" }}>
        {[
          { icon: Route, label: "Miles driven", value: fmtNumber(k.totalMiles), meta: `$${k.rpm.toFixed(2)} / mile` },
          { icon: Gauge, label: "Fleet utilization", value: `${k.fleetUtilization}%`, meta: "tractors revenue-ready" },
          { icon: TrendingUp, label: "Drivers active", value: String(k.activeDrivers), meta: "on payroll roster" },
          { icon: Banknote, label: "Loads rolling", value: String(k.activeLoads), meta: "booked + in transit" },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3.5 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-amber-400">
              <s.icon size={17} />
            </span>
            <div>
              <div className="mono text-[17px] font-bold leading-tight text-zinc-50">{s.value}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                {s.label}
              </div>
              <div className="text-[10.5px] text-zinc-600">{s.meta}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ---------------------------- Recent loads -------------------------- */}
      <Card className="rise overflow-hidden" style={{ animationDelay: "380ms" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <SectionHead title="Recent Loads" className="mb-0" />
          <Link href="/loads" className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-amber-500 hover:text-amber-300">
            View register <ArrowRight size={11} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Load</th><th>Broker</th><th>Driver</th><th>Route</th>
                <th className="text-right">Miles</th><th className="text-right">Rate</th>
                <th>Delivered</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentLoads.map((l) => (
                <tr key={l.id}>
                  <td className="mono font-semibold text-zinc-100">{l.loadNumber}</td>
                  <td className="max-w-[160px] truncate">{l.brokerName ?? "—"}</td>
                  <td className="max-w-[130px] truncate">{l.driverName ?? "—"}</td>
                  <td className="max-w-[260px] truncate text-zinc-400">
                    {l.pickupLocation} → {l.deliveryLocation}
                  </td>
                  <td className="mono text-right text-zinc-400">{fmtNumber(l.miles)}</td>
                  <td className="mono text-right font-semibold text-amber-300">{fmtMoney(l.rate)}</td>
                  <td className="text-zinc-400">{fmtDate(l.deliveryDate)}</td>
                  <td><Pill tone={loadStatusTone(l.status)}>{statusLabel(l.status)}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
