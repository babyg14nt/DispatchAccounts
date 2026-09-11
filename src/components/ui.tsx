"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn, fmtMoney, num, type Tone } from "@/lib/util";

/* ------------------------------ Page header ------------------------------ */
export function PageHeader({
  kicker,
  title,
  sub,
  actions,
}: {
  kicker: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mono mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.26em] text-amber-500">
          <span className="h-px w-6 bg-amber-500/60" />
          {kicker}
        </div>
        <h1 className="text-[30px] font-extrabold leading-none tracking-tight text-zinc-50 sm:text-[34px]">
          {title}
        </h1>
        {sub && <p className="mt-2 max-w-xl text-[13px] text-zinc-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/* --------------------------------- Card ---------------------------------- */
export function Card({
  className,
  children,
  hover = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn("card", hover && "card-hover", className)} {...rest}>
      {children}
    </div>
  );
}

/* ------------------------------- Count-up -------------------------------- */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = from + (target - from) * eased;
      setValue(p >= 1 ? target : v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

/* --------------------------------- Stat ----------------------------------- */
export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "amber",
  index = 0,
  countUp = true,
}: {
  label: string;
  value: number;
  sub?: React.ReactNode;
  icon: React.ElementType;
  tone?: "amber" | "emerald" | "rose" | "sky" | "violet";
  index?: number;
  countUp?: boolean;
}) {
  const animated = useCountUp(countUp ? value : 0);
  const shown = countUp ? animated : value;
  const tones = {
    amber: "text-amber-400 border-amber-400/20 bg-amber-400/[0.07]",
    emerald: "text-emerald-400 border-emerald-400/20 bg-emerald-400/[0.07]",
    rose: "text-rose-400 border-rose-400/20 bg-rose-400/[0.07]",
    sky: "text-sky-400 border-sky-400/20 bg-sky-400/[0.07]",
    violet: "text-violet-400 border-violet-400/20 bg-violet-400/[0.07]",
  };
  return (
    <Card className="rise relative overflow-hidden p-5" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/[0.025] blur-xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </div>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", tones[tone])}>
          <Icon size={15} />
        </span>
      </div>
      <div className="mono mt-2 text-[26px] font-bold tracking-tight text-zinc-50">
        {fmtMoney(shown)}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-zinc-500">{sub}</div>}
    </Card>
  );
}

/* ---------------------------------- Pill ---------------------------------- */
export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("pill", `tone-${tone}`, className)}>
      <span className="dot" />
      {children}
    </span>
  );
}

/* --------------------------------- Modal ---------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fade-in fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "modal-in relative my-auto w-full rounded-2xl border border-white/10 bg-[#101016] shadow-2xl shadow-black/70",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-4.5">
          <div className="px-0 py-1">
            <h3 className="text-[16px] font-bold tracking-tight text-zinc-50">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-zinc-500">{description}</p>}
          </div>
          <button className="icon-btn mt-0.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ Confirm dialog ---------------------------- */
export function ConfirmDialog({
  open,
  title = "Delete record?",
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-[13.5px] leading-relaxed text-zinc-400">{message}</p>
      <div className="mt-6 flex justify-end gap-2.5">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- Form field ------------------------------- */
export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mono mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}

/* ------------------------------ Section head ------------------------------ */
export function SectionHead({
  title,
  right,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-zinc-100">
        <span className="h-3.5 w-[3px] rounded-full bg-amber-400/80" />
        {title}
      </h2>
      {right}
    </div>
  );
}

/* ------------------------------- Empty state ------------------------------ */
export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-600">
        <Icon size={19} />
      </div>
      <div className="text-[13.5px] font-semibold text-zinc-300">{title}</div>
      {hint && <div className="max-w-xs text-[12px] leading-relaxed text-zinc-600">{hint}</div>}
    </div>
  );
}

/* --------------------------------- Loading -------------------------------- */
export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-10" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="shimmer h-3 w-40" />
        <div className="shimmer h-9 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shimmer h-32" />
        ))}
      </div>
      <div className="shimmer h-72" />
    </div>
  );
}

/* ------------------------------ Busy spinner ------------------------------ */
export function Spinner() {
  return <Loader2 size={14} className="animate-spin" />;
}

export { num };
