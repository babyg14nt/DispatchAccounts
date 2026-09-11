"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/util";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />,
  error: <AlertTriangle size={16} className="text-rose-400 shrink-0" />,
  info: <Info size={16} className="text-sky-400 shrink-0" />,
};

const BORDER: Record<ToastKind, string> = {
  success: "border-emerald-500/30",
  error: "border-rose-500/30",
  info: "border-sky-500/30",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, kind, message }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 w-[340px] no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "card modal-in flex items-start gap-2.5 px-4 py-3 text-[13px] leading-snug text-zinc-200 shadow-2xl shadow-black/60",
              BORDER[t.kind],
            )}
          >
            {ICONS[t.kind]}
            <span className="flex-1">{t.message}</span>
            <button
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
