"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Container,
  Landmark,
  LayoutDashboard,
  Loader2,
  Receipt,
  RefreshCw,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/util";

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Command",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/loads", label: "Loads & BOLs", icon: Container },
      { href: "/factoring", label: "Factoring", icon: Landmark },
      { href: "/settlements", label: "Settlements", icon: Wallet },
    ],
  },
  {
    title: "Fleet & People",
    items: [
      { href: "/drivers", label: "Drivers", icon: Users },
      { href: "/trucks", label: "Trucks & Equipment", icon: Truck },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    title: "Company",
    items: [
      { href: "/brokers", label: "Brokers & Shippers", icon: Building2 },
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-5">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)]">
        <Truck size={20} strokeWidth={2.4} className="text-[#1c1302]" />
        <span className="pulse-dot absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#060608] bg-emerald-400" />
      </div>
      <div>
        <div className="text-[15px] font-extrabold tracking-[0.14em] text-zinc-50">
          IRONHAUL
        </div>
        <div className="mono text-[9.5px] uppercase tracking-[0.24em] text-zinc-500">
          Carrier OS
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-[9px] text-[13.5px] font-medium transition-all duration-150",
        active
          ? "bg-amber-400/[0.08] text-amber-300"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full transition-all duration-200",
          active ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.8)]" : "bg-transparent group-hover:bg-zinc-600",
        )}
      />
      <Icon
        size={17}
        strokeWidth={active ? 2.3 : 2}
        className={cn("transition-colors", active ? "text-amber-400" : "text-zinc-500 group-hover:text-zinc-300")}
      />
      {item.label}
    </Link>
  );
}

function ResetDemo() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/seed", { method: "POST" });
          toast.success("Demo dataset regenerated");
          setTimeout(() => window.location.reload(), 450);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Seed failed");
          setBusy(false);
        }
      }}
      className="btn btn-ghost btn-sm w-full text-zinc-500 hover:text-zinc-200"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      Reset demo data
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* ------------------------------ Desktop --------------------------- */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-white/[0.06] bg-[#0a0a0f]/90 backdrop-blur-xl lg:flex">
        <Brand />
        <nav className="flex-1 space-y-6 overflow-y-auto px-3.5 pb-4">
          {NAV.map((group) => (
            <div key={group.title}>
              <div className="mono px-3 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/[0.06] px-4 py-4">
          <ResetDemo />
          <div className="flex items-center justify-between px-1">
            <span className="mono text-[9.5px] uppercase tracking-widest text-zinc-600">
              MC 118-442 · DOT 2533110
            </span>
            <span className="mono rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-zinc-500">
              v2.4
            </span>
          </div>
        </div>
      </aside>

      {/* ------------------------------- Mobile ---------------------------- */}
      <header className="no-print fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0f]/95 px-3 py-2.5 backdrop-blur-xl lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600">
          <Truck size={16} strokeWidth={2.4} className="text-[#1c1302]" />
        </div>
        <span className="mr-1 text-[13px] font-extrabold tracking-[0.12em] text-zinc-100">
          IRONHAUL
        </span>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {NAV.flatMap((g) => g.items).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-amber-400/10 text-amber-300" : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                <Icon size={17} />
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
