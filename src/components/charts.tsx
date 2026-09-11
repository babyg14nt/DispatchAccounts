"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/util";

/* ------------------------------ Tooltip skin ----------------------------- */
function ChartTooltip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#14141c]/95 px-3.5 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md">
      <div className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label ?? payload[0]?.name}
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-5 text-[12px]">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
            {p.name}
          </span>
          <span className="mono font-semibold text-zinc-100">
            {money ? fmtMoney(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Monthly P&L chart ---------------------------- */
type MonthlyPoint = { label: string; revenue: number; expenses: number; net: number };

export function MonthlyPnLChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffc24d" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} dy={8} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" name="Revenue" fill="url(#revBar)" radius={[5, 5, 0, 0]} maxBarSize={34} />
        <Line type="monotone" dataKey="expenses" name="Total OPEX" stroke="#fb7185" strokeWidth={2} dot={false} strokeDasharray="1 0" />
        <Line type="monotone" dataKey="net" name="Net profit" stroke="#34d399" strokeWidth={2.4} dot={{ r: 2.5, fill: "#34d399", strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* --------------------------- Revenue by truck ---------------------------- */
type TruckPoint = { unit: string; revenue: number; loads: number };

export function RevenueByTruckChart({ data }: { data: TruckPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="truckBar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="unit"
          axisLine={false}
          tickLine={false}
          width={56}
          tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <Tooltip content={<ChartTooltip label="unit" />} />
        <Bar dataKey="revenue" name="Revenue" fill="url(#truckBar)" radius={[0, 5, 5, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopBrokersChart({ data }: { data: { name: string; revenue: number; loads: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={252}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="brokerBar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          axisLine={false}
          tickLine={false}
          width={148}
          tick={{ fill: "#a1a1aa", fontSize: 10.5 }}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" name="Revenue" fill="url(#brokerBar)" radius={[0, 5, 5, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------- Expense donut ------------------------------ */
export const CATEGORY_COLORS: Record<string, string> = {
  fuel: "#f59e0b",
  insurance: "#818cf8",
  ifta: "#38bdf8",
  permits: "#a78bfa",
  office: "#94a3b8",
  tolls: "#34d399",
  maintenance: "#fb7185",
  other: "#64748b",
};

export function ExpenseDonut({
  data,
  size = 252,
}: {
  data: { category: string; amount: number }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="relative" style={{ height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            innerRadius={size / 2 - 42}
            outerRadius={size / 2 - 16}
            paddingAngle={2.5}
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((d) => (
              <Cell key={d.category} fill={CATEGORY_COLORS[d.category] ?? "#64748b"} opacity={0.92} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="mono text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Total OPEX
        </div>
        <div className="mono text-[19px] font-bold text-zinc-50">{fmtMoney(total)}</div>
      </div>
    </div>
  );
}

/* --------------------------- Shared legend row ---------------------------- */
export function LegendItem({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-2 text-zinc-400">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      {value && <span className="mono font-semibold text-zinc-200">{value}</span>}
    </div>
  );
}
